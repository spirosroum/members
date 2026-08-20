-- =====================================================================
-- GymDesk → Supabase migration: preserve "paid: covered (no payment record)"
-- visits through recompute_member.
--
-- Bug: recompute_member's full reset marked every visit unpaid unless it had
-- paid_override='paid'. A visit that is paid but has no covering payment record
-- and no override ("covered (no payment record)") therefore had its paid status
-- wiped on the next recompute. Because it has no ledger backing to re-derive
-- from, adding a new payment (e.g. a drop-in session) then left it unpaid while
-- the newly-granted session got consumed by another visit — the previously paid
-- check-in was inverted to Unpaid.
--
-- Fix: the reset now leaves currently-paid visits (no override, not attributable
-- to a covering time-payment window) untouched, so "covered (no payment record)"
-- visits survive a recompute. Time/membership-covered visits are still reset and
-- re-derived, preserving the "deleting a payment re-marks its visits unpaid"
-- invariant.
-- =====================================================================

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
  -- correctly re-marks its previously-covered visits as unpaid). The one
  -- exception is a visit that is currently paid but has no manual override and
  -- is not attributable to a covering time-payment window ("paid: covered (no
  -- payment record)"). Such a visit has no ledger backing to re-derive from, so
  -- it must be preserved rather than wiped by the reset.
  update visits set is_unpaid = true
  where member_id = p_member_id
    and paid_override is distinct from 'paid'
    and not (
      is_unpaid = false
      and paid_override is null
      and not exists (
        select 1 from payments p
        where p.member_id = p_member_id
          and p.applied_expiration is not null
          and coalesce(p.sessions_granted, 0) = 0
          and p.applied_start_date is not null
          and (visits.entry_time at time zone 'Europe/Athens')::date >= p.applied_start_date
          and (visits.entry_time at time zone 'Europe/Athens')::date <= p.applied_expiration
      )
    );

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
  if v_exp is not null and v_exp >= (now() at time zone 'Europe/Athens')::date then
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
      when (v_exp is not null and v_exp >= (now() at time zone 'Europe/Athens')::date)
           or (v_total_sessions - v_sessions_used > 0) then 'active'
      else 'inactive'
    end
  where id = p_member_id;
end $$;
