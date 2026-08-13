-- =====================================================================
-- GymDesk → Supabase migration: server-side payment recompute.
-- Replaces the client-side reconcileMemberPaymentVisitStatus with a
-- single source of truth: recompute_member() derives sessions / expiration
-- / account_status from the payment ledger + visits after any change.
-- Apply after 000001 (create-or-replace, idempotent).
-- =====================================================================

-- Derive a member's coverage snapshot from their payment ledger + visits.
create or replace function public.recompute_member(p_member_id text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mem members%rowtype;
  v_total_sessions int := 0;
  v_exp date := null;
  v_sessions_used int := 0;
  v_visit visits%rowtype;
begin
  select * into v_mem from members where id = p_member_id for update;
  if not found then return; end if;

  select coalesce(sum(sessions_granted), 0) into v_total_sessions
    from payments where member_id = p_member_id and sessions_granted > 0;

  select max(applied_expiration) into v_exp
    from payments
    where member_id = p_member_id
      and applied_expiration is not null
      and coalesce(sessions_granted, 0) = 0;

  -- Full recompute: manual 'paid' overrides stay paid; everything else starts
  -- unpaid and is re-derived from the ledger below (so deleting a payment
  -- correctly re-marks its previously-covered visits as unpaid).
  update visits set is_unpaid = (paid_override is distinct from 'paid')
  where member_id = p_member_id;

  -- 1) Historical time windows: any time-based payment's [start, expiration].
  update visits set is_unpaid = false
  where member_id = p_member_id and paid_override is null
    and exists (
      select 1 from payments p
      where p.member_id = p_member_id
        and p.applied_expiration is not null
        and coalesce(p.sessions_granted, 0) = 0
        and p.applied_start_date is not null
        and (visits.entry_time at time zone 'Europe/Athens')::date >= p.applied_start_date
        and (visits.entry_time at time zone 'Europe/Athens')::date <= p.applied_expiration
    );

  -- 2) Session quota, consumed chronologically.
  for v_visit in
    select v.* from visits v
    where v.member_id = p_member_id and v.is_unpaid and v.paid_override is null
    order by v.entry_time asc
  loop
    if v_sessions_used < v_total_sessions then
      v_sessions_used := v_sessions_used + 1;
      update visits set is_unpaid = false where id = v_visit.id;
    else
      exit;
    end if;
  end loop;

  -- 3) Active membership: retroactively cover the remaining unpaid visits
  -- from the first unpaid day up to the expiration date (NOT from the
  -- payment's start date, which would miss prior trainings).
  if v_exp is not null and v_exp >= current_date then
    update visits set is_unpaid = false
    where member_id = p_member_id and is_unpaid and paid_override is null
      and (entry_time at time zone 'Europe/Athens')::date <= v_exp;
  end if;

  update members set
    sessions_total = (v_total_sessions > 0),
    sessions_left = greatest(0, v_total_sessions - v_sessions_used),
    expiration_date = v_exp,
    account_status = case
      when account_status in ('frozen','cancelled') then account_status
      when (v_exp is not null and v_exp >= current_date) or (v_total_sessions - v_sessions_used > 0) then 'active'
      else 'inactive'
    end
  where id = p_member_id;
end $$;

-- Apply (insert or update) a payment, then recompute the member.
create or replace function public.apply_payment(p_payment jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_member_id        text := p_payment->>'memberId';
  v_id               text := coalesce(p_payment->>'id', 'PAY-' || (extract(epoch from clock_timestamp())*1000)::bigint);
  v_plan_id          text := p_payment->>'planId';
  v_sessions_granted int  := nullif(p_payment->>'sessionsGranted','')::int;
  v_amount           numeric := coalesce(nullif(p_payment->>'amount','')::numeric, 0);
  v_date             date := coalesce(nullif(p_payment->>'date','')::date, current_date);
  v_note             text := p_payment->>'note';
  v_applied_start    date := nullif(p_payment->>'appliedStartDate','')::date;
  v_applied_expiration date := nullif(p_payment->>'appliedExpiration','')::date;
  v_prev_expiration  date := nullif(p_payment->>'prevExpiration','')::date;
  v_plan             plans%rowtype;
  v_was_active       boolean;
begin
  if not public.is_admin() then raise exception 'admin required'; end if;
  if v_member_id is null or v_member_id = '' then raise exception 'memberId is required'; end if;

  select (account_status = 'active') into v_was_active from members where id = v_member_id;

  if v_plan_id is not null then
    select * into v_plan from plans where id = v_plan_id;
    if found then
      if v_plan.sessions is not null and v_plan.sessions > 0 then
        v_sessions_granted := coalesce(v_sessions_granted, v_plan.sessions);
      elsif v_plan.days is not null and v_plan.days > 0 then
        v_applied_expiration := coalesce(v_applied_expiration, ((coalesce(v_applied_start, v_date) + v_plan.days))::date);
      end if;
    end if;
  end if;

  insert into payments
    (id, member_id, date, amount, note, plan_id, sessions_granted,
     applied_expiration, applied_start_date, prev_expiration)
  values
    (v_id, v_member_id, v_date, v_amount, v_note, v_plan_id, v_sessions_granted,
     v_applied_expiration, coalesce(v_applied_start, v_date), v_prev_expiration)
  on conflict (id) do update set
    member_id = excluded.member_id,
    date = excluded.date,
    amount = excluded.amount,
    note = excluded.note,
    plan_id = excluded.plan_id,
    sessions_granted = excluded.sessions_granted,
    applied_expiration = excluded.applied_expiration,
    applied_start_date = excluded.applied_start_date,
    prev_expiration = excluded.prev_expiration;

  -- A new payment intends to cover outstanding activity: clear stale manual
  -- "unpaid" overrides so the recompute below decides coverage cleanly.
  update visits set paid_override = null
  where member_id = v_member_id and paid_override = 'unpaid';

  perform public.recompute_member(v_member_id);

  if v_plan_id is not null and v_plan.id is not null then
    if v_plan.is_trial then
      update members set trial_participant = true where id = v_member_id;
    elsif v_amount > 0 then
      update members set trial_converted = true where id = v_member_id;
    end if;
    if v_plan.days is not null and v_plan.days > 0 and (v_plan.sessions is null or v_plan.sessions = 0) then
      update members set plan_days = v_plan.days where id = v_member_id;
    elsif v_sessions_granted is not null and v_sessions_granted > 0 then
      update members set plan_days = null where id = v_member_id;
    end if;
  end if;

  if not v_was_active and exists (select 1 from members where id = v_member_id and account_status = 'active') then
    perform public.create_notification(
      'Member Activated',
      (select first_name || ' ' || last_name from members where id = v_member_id)
        || ' was activated by recorded payment.',
      'success', v_member_id);
  end if;
end $$;

-- Delete a payment, then recompute the member.
create or replace function public.delete_payment(p_member_id text, p_payment_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin required'; end if;
  delete from payments where id = p_payment_id and member_id = p_member_id;
  perform public.recompute_member(p_member_id);
end $$;
