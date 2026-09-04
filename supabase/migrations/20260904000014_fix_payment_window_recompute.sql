-- =====================================================================
-- GymDesk → Supabase migration: bracket payment coverage to actual windows.
--
-- Root cause:
--   recompute_member retroactively marked remaining unpaid visits as paid when a
--   time-based payment still had a future expiration date, even when the visit
--   was earlier than the payment's own start date. That allowed a payment that
--   starts on 2026-09-01 to cover a workout from 2026-08-01 and made the
--   session-ledger look like it had created extra sessions.
--
-- Fix:
--   - payment coverage only applies to visits within [applied_start_date, applied_expiration]
--   - a future payment never retroactively covers older workouts
--   - age/active membership logic still keeps members active when they have
--     valid current coverage, but zero remaining sessions is a valid "active without sessions"
--     state instead of being auto-extended from ancient expiration windows
--   - legacy rows missing applied_start_date are normalized to the payment date
--     before the recompute runs, so the database remains backwards-compatible
-- =====================================================================

-- Repair legacy time-based payments that were created without a start window.
-- The payment date is the conservative default: a payment cannot cover earlier
-- workouts than the day it was logged, and the recompute below will only use the
-- actual start date when it is explicitly set.
update public.payments
set applied_start_date = coalesce(applied_start_date, date)
where applied_start_date is null
  and applied_expiration is not null
  and coalesce(sessions_granted, 0) = 0;

create or replace function public.recompute_member(p_member_id text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_total_sessions int := 0;
  v_exp           date := null;
  v_sessions_used int := 0;
  v_visit         visits%rowtype;
  v_today         date := (now() at time zone 'Europe/Athens')::date;
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

  -- Preserve legitimate paid visits that have no payment row to re-derive from,
  -- but reset any visit that is not clearly covered by a valid active payment.
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

  -- Time-based coverage is valid only inside the payment's own recorded window.
  -- A future payment cannot cover a workout that occurred before the payment's
  -- start date, even if the member's later expiration window is still active.
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

  -- Session grants consume the oldest unpaid visit first.
  for v_visit in
    select v.*
    from public.visits v
    where v.member_id = p_member_id
      and v.is_unpaid = true
      and v.paid_override is null
    order by v.entry_time asc
  loop
    if v_sessions_used < v_total_sessions then
      v_sessions_used := v_sessions_used + 1;
      update public.visits set is_unpaid = false where id = v_visit.id;
    else
      exit;
    end if;
  end loop;

  update public.members set
    sessions_total = (v_total_sessions > 0),
    sessions_left = greatest(0, v_total_sessions - v_sessions_used),
    expiration_date = v_exp,
    account_status = case
      when account_status in ('frozen', 'cancelled') then account_status
      when (v_exp is not null and v_exp >= v_today) or (v_total_sessions - v_sessions_used > 0) then 'active'
      else 'inactive'
    end
  where id = p_member_id;
end $$;

-- Recompute every member once after the migration so older rows settle into the
-- corrected payment-window rules without rebuilding the whole schema.
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
