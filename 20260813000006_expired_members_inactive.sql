-- =====================================================================
-- GymDesk → Supabase migration: expired members must become Inactive.
-- Two bugs:
--   1) check_in_member decided coverage with the server's UTC current_date,
--      but the client badges use the Athens (Europe/Athens, UTC+3) date.
--      For up to 3 hours after Athens midnight, a lapsed membership was
--      still "covered" server-side, so the visit was written is_unpaid=false
--      (shown as OK / "paid: covered (no payment record)") with no payment.
--      Fix: compare expiration against the Athens date.
--   2) Nothing ever flipped a lapsed member to account_status='inactive'.
--      "Expired" was only a UI label derived from expiration_date. Now the
--      check-in flips unpaid members to inactive, and a nightly cron sweep
--      does the same for members who never check in again.
-- =====================================================================

-- check_in_member: Athens-date coverage + auto-inactivate on unpaid check-in.
create or replace function public.check_in_member(
  p_member_id              text,
  p_class_selections       jsonb default '[]'::jsonb,
  p_entry_time             timestamptz default now(),
  p_default_timeout_hours  int default 1,
  p_backdated              boolean default false
)
returns table (visit_id text, is_unpaid boolean, sessions_left integer, rejected boolean, reason text)
language plpgsql security definer set search_path = public as $$
declare
  v_mem          members%rowtype;
  v_covered      boolean;
  v_has_time     boolean;
  v_unpaid       boolean;
  v_expected     timestamptz;
  v_already_ended boolean;
  v_visit_id     text;
  v_existing     visits%rowtype;
  v_sel          jsonb;
  v_slot_date    date;
  v_end          timestamptz;
  v_latest_end   timestamptz := null;
  v_class_ids    text[] := '{}';
  v_dup          boolean;
  v_prefix       bigint;
  v_counter      int := 0;
  v_ckid         text;
begin
  if p_member_id is null or p_member_id = '' then
    return query select null::text, false, 0, true, 'member_not_found';
    return;
  end if;

  select * into v_mem from public.members where id = p_member_id for update;
  if not found or v_mem.deleted_at is not null then
    return query select null::text, false, 0, true, 'member_not_found';
    return;
  end if;

  if v_mem.account_status in ('frozen','cancelled') then
    perform public.create_notification(
      case v_mem.account_status
        when 'frozen' then 'Frozen Check-in Attempt'
        else 'Cancelled Check-in Attempt'
      end,
      v_mem.first_name || ' ' || v_mem.last_name
        || ' attempted to check in, but their account is ' || lower(v_mem.account_status) || '.',
      'warning', v_mem.id);
    return query select null::text, false, v_mem.sessions_left, true,
                        'account_' || lower(v_mem.account_status);
    return;
  end if;

  -- derive expected exit + class ids from selections
  for v_sel in select value from jsonb_array_elements(p_class_selections) loop
    if v_sel->>'classId' is null or v_sel->>'classId' = '' then
      continue;
    end if;
    v_class_ids := array_append(v_class_ids, v_sel->>'classId');
    if (v_sel->>'slotEnd') is not null and (v_sel->>'slotEnd') <> '' then
      v_slot_date := nullif(v_sel->>'slotDate','')::date;
      begin
        v_end := (coalesce(to_char(v_slot_date,'YYYY-MM-DD'),
                           to_char((p_entry_time at time zone 'UTC'),'YYYY-MM-DD'))
                  || ' ' || (v_sel->>'slotEnd'))::timestamptz;
        if v_latest_end is null or v_end > v_latest_end then
          v_latest_end := v_end;
        end if;
      exception when others then null;
      end;
    end if;
  end loop;

  if v_latest_end is not null then
    v_expected := v_latest_end + interval '15 minutes';
  else
    v_expected := p_entry_time + make_interval(hours => p_default_timeout_hours);
  end if;

  v_already_ended := v_expected <= p_entry_time;

  -- Coverage vs the Athens date so it matches the client's badges (Greece is
  -- UTC+3; the server's UTC current_date would keep a lapsed member "covered"
  -- for up to 3 hours after Athens midnight and mark the visit paid).
  v_has_time := v_mem.expiration_date is not null
                and v_mem.expiration_date >= (now() at time zone 'Europe/Athens')::date;
  v_covered  := v_has_time or v_mem.sessions_left > 0;
  v_unpaid   := not v_covered;

  -- duplicate class-selection guard (moved server-side)
  for v_sel in select value from jsonb_array_elements(p_class_selections) loop
    select exists (
      select 1 from public.class_checkins
      where member_id = v_mem.id
        and class_id  = v_sel->>'classId'
        and slot_date  is not distinct from nullif(v_sel->>'slotDate','')::date
        and slot_start is not distinct from nullif(v_sel->>'slotStart','')::time
        and slot_end   is not distinct from nullif(v_sel->>'slotEnd','')::time
    ) into v_dup;
    if v_dup then
      return query select null::text, v_unpaid, v_mem.sessions_left, true, 'already_checked_in';
      return;
    end if;
  end loop;

  -- existing open visit to merge into (back-to-back classes)
  select * into v_existing
  from public.visits
  where member_id = v_mem.id
    and exit_time is null
    and expected_exit_time is not null
    and expected_exit_time > p_entry_time
  order by entry_time desc
  limit 1;

  if v_existing.id is not null and not v_already_ended and not p_backdated then
    v_visit_id := v_existing.id;
    update public.visits
       set expected_exit_time = greatest(coalesce(expected_exit_time, v_expected), v_expected),
           class_ids = array(select distinct unnest(coalesce(class_ids,'{}') || v_class_ids)),
           is_unpaid = is_unpaid or v_unpaid
     where id = v_visit_id;
  else
    if not v_already_ended and not p_backdated then
      update public.visits set exit_time = p_entry_time
       where member_id = v_mem.id and exit_time is null;
    end if;
    v_visit_id := 'V-' || (extract(epoch from clock_timestamp()) * 1000)::bigint;
    insert into public.visits (id, member_id, entry_time, expected_exit_time, exit_time, is_unpaid, class_ids)
    values (v_visit_id, v_mem.id, p_entry_time, v_expected,
            case when (v_already_ended or p_backdated) then v_expected else null end,
            v_unpaid, coalesce(v_class_ids,'{}'));
  end if;

  -- class check-in rows
  v_prefix := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  for v_sel in select value from jsonb_array_elements(p_class_selections) loop
    if v_sel->>'classId' is null or v_sel->>'classId' = '' then
      continue;
    end if;
    v_counter := v_counter + 1;
    v_ckid := 'CC-' || v_mem.id || '-' || v_prefix || '-' || v_counter;
    insert into public.class_checkins
      (id, visit_id, member_id, class_id, slot_date, slot_day, slot_start, slot_end, entry_time)
    values
      (v_ckid, v_visit_id, v_mem.id, v_sel->>'classId',
       nullif(v_sel->>'slotDate','')::date,
       v_sel->>'slotDay',
       nullif(v_sel->>'slotStart','')::time,
       nullif(v_sel->>'slotEnd','')::time,
       p_entry_time);
  end loop;

  -- decrement a session only when covered and session-reliant
  if v_covered and not v_has_time then
    v_mem.sessions_left := v_mem.sessions_left - 1;
    update public.members set sessions_left = v_mem.sessions_left where id = v_mem.id;
  end if;

  -- Expired members lapse to Inactive at their first uncovered check-in so the
  -- stored status (and every badge) stops calling them Active/"Expired".
  if v_unpaid and v_mem.account_status = 'active' then
    update public.members set account_status = 'inactive' where id = v_mem.id;
  end if;

  if v_unpaid then
    perform public.create_notification(
      'Expired/Unpaid Member Check-in',
      v_mem.first_name || ' ' || v_mem.last_name
        || ' checked in, but their visit is unpaid or they are out of sessions.',
      'danger', v_mem.id);
  end if;

  return query select v_visit_id, v_unpaid, v_mem.sessions_left, false, null::text;
end $$;

-- recompute_member: use the Athens date for coverage decisions so recompute
-- and the live check-in RPC agree with the client's Athens-based badges.
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

-- Nightly sweep: any Active member whose time-based membership has lapsed and
-- who has no sessions left becomes Inactive — even if they never check in
-- again (the check-in path above only catches members who do).
select cron.schedule(
  'expire-members-inactive',
  '0 2 * * *',
  $$ update public.members
        set account_status = 'inactive',
            updated_at = now()
      where account_status = 'active'
        and deleted_at is null
        and expiration_date is not null
        and expiration_date < (now() at time zone 'Europe/Athens')::date
        and coalesce(sessions_left, 0) = 0 $$
);

-- One-time backfill: for members already lapsed under the old (UTC-date)
-- check-in logic, recompute the ledger so any wrongly-"paid" visits become
-- unpaid again and the member status settles on inactive. Only members with
-- payment records are recomputed — a legacy member whose expiration_date was
-- set manually (no ledger) must not have it wiped by the recompute.
do $$
declare v_mid text;
begin
  for v_mid in
    select m.id from public.members m
    where m.account_status = 'active'
      and m.deleted_at is null
      and m.expiration_date is not null
      and m.expiration_date < (now() at time zone 'Europe/Athens')::date
      and coalesce(m.sessions_left, 0) = 0
      and exists (select 1 from public.payments p where p.member_id = m.id)
  loop
    begin
      perform public.recompute_member(v_mid);
    exception when others then null;
    end;
  end loop;
end $$;
