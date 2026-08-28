-- =====================================================================
-- Record the department (schedule/class) where a check-in took place.
-- `visits.class_ids` already stores the raw class ids; this adds a
-- human-readable `department` column (schedule names) so reporting does
-- not need to join through class_checkins/schedules.
-- =====================================================================

alter table public.visits
  add column if not exists department text;

-- Backfill existing visits from their class check-ins.
update public.visits v
   set department = d.dep
  from (
    select cc.visit_id,
           string_agg(distinct s.name, ', ' order by s.name) as dep
      from public.class_checkins cc
      join public.schedules s on s.id = cc.class_id
     group by cc.visit_id
  ) d
 where d.visit_id = v.id
   and v.department is null;

-- check_in_member: resolve the selected class(es) into a department name.
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
  v_departments  text[] := '{}';
  v_dep_name     text;
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

  -- derive expected exit + class ids + department from selections
  for v_sel in select value from jsonb_array_elements(p_class_selections) loop
    if v_sel->>'classId' is null or v_sel->>'classId' = '' then
      continue;
    end if;
    v_class_ids := array_append(v_class_ids, v_sel->>'classId');
    select name into v_dep_name from public.schedules where id = v_sel->>'classId';
    if v_dep_name is not null and not (v_dep_name = any (v_departments)) then
      v_departments := array_append(v_departments, v_dep_name);
    end if;
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
           is_unpaid = is_unpaid or v_unpaid,
           department = case
             when v_departments is null or cardinality(v_departments) = 0 then department
             else array_to_string(v_departments, ', ')
           end
     where id = v_visit_id;
  else
    if not v_already_ended and not p_backdated then
      update public.visits set exit_time = p_entry_time
       where member_id = v_mem.id and exit_time is null;
    end if;
    v_visit_id := 'V-' || (extract(epoch from clock_timestamp()) * 1000)::bigint;
    insert into public.visits (id, member_id, entry_time, expected_exit_time, exit_time, is_unpaid, class_ids, department)
    values (v_visit_id, v_mem.id, p_entry_time, v_expected,
            case when (v_already_ended or p_backdated) then v_expected else null end,
            v_unpaid, coalesce(v_class_ids,'{}'),
            case when v_departments is null or cardinality(v_departments) = 0 then null
                 else array_to_string(v_departments, ', ')
            end);
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