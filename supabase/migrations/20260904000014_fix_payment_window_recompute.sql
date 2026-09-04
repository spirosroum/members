-- =====================================================================
-- GymDesk → Supabase migration: payment windows + session queue fix.
--
-- The root problem was twofold:
--   1) a future payment window could cover older workouts because the recompute
--      only checked the payment's expiration, not its actual start date.
--   2) session grants were treated as a flat lifetime total instead of a
--      consumable pool that must pay the oldest unpaid visits first.
--
-- Correct behavior:
--   - time-based payments only cover visits in [applied_start_date, applied_expiration]
--   - a future payment never retroactively pays older workouts
--   - session grants consume the oldest unpaid visit first, then the remaining
--     credit becomes sessions_left
--   - legacy rows without applied_start_date are repaired to the payment date
-- =====================================================================

-- Repair legacy time-based payments missing their coverage start.
update public.payments
set applied_start_date = coalesce(applied_start_date, date)
where applied_start_date is null
  and applied_expiration is not null
  and coalesce(sessions_granted, 0) = 0;

create or replace function public.apply_payment(p_payment jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_member_id          text := p_payment->>'memberId';
  v_id                 text := coalesce(p_payment->>'id', 'PAY-' || (extract(epoch from clock_timestamp())*1000)::bigint);
  v_plan_id            text := p_payment->>'planId';
  v_sessions_granted   int  := nullif(p_payment->>'sessionsGranted','')::int;
  v_amount             numeric := coalesce(nullif(p_payment->>'amount','')::numeric, 0);
  v_date               date := coalesce(nullif(p_payment->>'date','')::date, current_date);
  v_note               text := p_payment->>'note';
  v_applied_start      date := nullif(p_payment->>'appliedStartDate','')::date;
  v_applied_expiration date := nullif(p_payment->>'appliedExpiration','')::date;
  v_prev_expiration    date := nullif(p_payment->>'prevExpiration','')::date;
  v_plan               plans%rowtype;
begin
  if not public.is_admin() then
    raise exception 'admin required';
  end if;

  if v_member_id is null or v_member_id = '' then
    raise exception 'memberId is required';
  end if;

  if v_plan_id is not null then
    select * into v_plan from plans where id = v_plan_id;
    if found then
      if v_plan.sessions is not null and v_plan.sessions > 0 then
        v_sessions_granted := coalesce(v_sessions_granted, v_plan.sessions);
      elsif v_plan.days is not null and v_plan.days > 0 then
        v_applied_start := coalesce(v_applied_start, v_date);
        v_applied_expiration := coalesce(v_applied_expiration, ((v_applied_start + v_plan.days)::date));
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

  -- New payments should not increment member sessions_left directly. The ledger
  -- owns truth, and recompute_member derives the state from that ledger.
  update visits set paid_override = null
  where member_id = v_member_id and paid_override = 'unpaid';

  perform public.recompute_member(v_member_id);
end $$;

create or replace function public.recompute_member(p_member_id text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_total_sessions int := 0;
  v_session_pool   int := 0;
  v_exp            date := null;
  v_today          date := (now() at time zone 'Europe/Athens')::date;
  v_visit          visits%rowtype;
begin
  if p_member_id is null or p_member_id = '' then
    return;
  end if;

  if not exists (select 1 from public.members where id = p_member_id) then
    return;
  end if;

  select coalesce(sum(sessions_granted), 0) into v_total_sessions
  from public.payments
  where member_id = p_member_id and sessions_granted is not null and sessions_granted > 0;

  select max(applied_expiration) into v_exp
  from public.payments
  where member_id = p_member_id
    and applied_expiration is not null
    and coalesce(sessions_granted, 0) = 0;

  -- Preserve valid legacy paid-without-ledger visits, but reset all other visits
  -- before recomputing coverage from the payment ledger.
  update public.visits set is_unpaid = true
  where member_id = p_member_id
    and paid_override is distinct from 'paid'
    and not (
      is_unpaid = false
      and paid_override is null
      and not exists (
        select 1
        from public.payments p
        where p.member_id = p_member_id
          and p.applied_expiration is not null
          and coalesce(p.sessions_granted, 0) = 0
          and coalesce(p.applied_start_date, p.date) <= (visits.entry_time at time zone 'Europe/Athens')::date
          and (visits.entry_time at time zone 'Europe/Athens')::date <= p.applied_expiration
      )
    );

  -- Time-based coverage only applies within each payment's real date window.
  update public.visits set is_unpaid = false
  where member_id = p_member_id
    and paid_override is null
    and exists (
      select 1
      from public.payments p
      where p.member_id = p_member_id
        and p.applied_expiration is not null
        and coalesce(p.sessions_granted, 0) = 0
        and coalesce(p.applied_start_date, p.date) <= (visits.entry_time at time zone 'Europe/Athens')::date
        and (visits.entry_time at time zone 'Europe/Athens')::date <= p.applied_expiration
    );

  -- Session grants are a consumable pool: spend it against the oldest unpaid
  -- workouts first. This prevents later payments from inventing extra sessions
  -- or leaving stale session totals behind.
  v_session_pool := v_total_sessions;
  for v_visit in
    select v.*
    from public.visits v
    where v.member_id = p_member_id
      and v.is_unpaid = true
      and v.paid_override is null
    order by v.entry_time asc
  loop
    if v_session_pool <= 0 then
      exit;
    end if;
    update public.visits set is_unpaid = false where id = v_visit.id;
    v_session_pool := v_session_pool - 1;
  end loop;

  update public.members set
    sessions_total = (v_total_sessions > 0),
    sessions_left = greatest(0, v_session_pool),
    expiration_date = v_exp,
    account_status = case
      when account_status in ('frozen', 'cancelled') then account_status
      when (v_exp is not null and v_exp >= v_today) or (v_session_pool > 0) then 'active'
      else 'inactive'
    end
  where id = p_member_id;
end $$;

-- Recompute current table state once so legacy rows settle under the corrected
-- rules without breaking the existing schema.
do $$
declare
  v_member text;
begin
  for v_member in
    select id from public.members order by id
  loop
    perform public.recompute_member(v_member);
  end loop;
end $$;
