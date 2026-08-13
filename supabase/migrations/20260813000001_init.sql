-- =====================================================================
-- GymDesk → Supabase migration: initial schema
-- Phase 1 (approved): tables, enums, triggers, RPCs, RLS, realtime, seed.
-- Applied via `supabase db push` or the SQL editor.
-- =====================================================================

-- ── extensions ──────────────────────────────────────────────────────
create extension if not exists citext;
create extension if not exists pgcrypto;

-- ── enums ───────────────────────────────────────────────────────────
create type public.staff_role as enum ('admin', 'staff');
create type public.bin_entity as enum ('member', 'plan', 'schedule', 'notification');

-- =====================================================================
-- AUTH IDENTITY / RBAC
-- =====================================================================
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  role       staff_role not null default 'staff',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- MEMBERS (public-safe row: no PII)
-- =====================================================================
create table public.members (
  id                    text primary key,
  first_name            text not null default '',
  last_name             text not null default '',
  gender                text,
  belt                  text not null default 'White',
  expiration_date       date,
  account_status        text not null default 'active'
                          check (account_status in ('active','frozen','cancelled','inactive')),
  sessions_total        boolean not null default false,
  sessions_left         integer not null default 0 check (sessions_left >= 0),
  plan_days             integer,
  hide_from_leaderboard boolean not null default false,
  trial_participant     boolean not null default false,
  trial_converted       boolean not null default false,
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index members_active_idx on members (id) where deleted_at is null;

-- =====================================================================
-- MEMBER PII (admin only)
-- =====================================================================
create table public.member_private (
  member_id text primary key references members (id) on update cascade on delete cascade,
  email     citext,
  phone     text,
  dob       date,
  notes     text
);

-- =====================================================================
-- VISITS
-- =====================================================================
create table public.visits (
  id                 text primary key,
  member_id          text not null references members (id) on update cascade on delete cascade,
  entry_time         timestamptz not null default now(),
  expected_exit_time timestamptz,
  exit_time          timestamptz,
  is_unpaid          boolean not null default false,
  paid_override      text,
  class_ids          text[] not null default '{}',
  is_open            boolean generated always as (exit_time is null) stored,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index visits_open_idx   on visits (is_open) where exit_time is null;
create index visits_member_idx on visits (member_id, entry_time);

-- =====================================================================
-- CLASS CHECK-INS
-- =====================================================================
create table public.class_checkins (
  id         text primary key,
  visit_id   text not null references visits (id) on update cascade on delete cascade,
  member_id  text not null references members (id) on update cascade on delete cascade,
  class_id   text not null,
  slot_date  date,
  slot_day   text,
  slot_start time,
  slot_end   time,
  entry_time timestamptz
);

create index class_checkins_member_idx on class_checkins (member_id, entry_time);

-- =====================================================================
-- SCHEDULES + SLOTS
-- =====================================================================
create table public.schedules (
  id               text primary key,
  name             text not null,
  description      text,
  description_html boolean not null default false,
  practitioners    text,
  requirements     text,
  color            text not null default '#2563eb',
  capacity         integer,
  is_public        boolean not null default true,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.schedule_slots (
  id          text primary key,
  schedule_id text not null references schedules (id) on update cascade on delete cascade,
  day         text not null,
  start       time not null,
  "end"       time not null
);

create index schedule_slots_schedule_idx on schedule_slots (schedule_id);

-- =====================================================================
-- CLOSED DATES
-- =====================================================================
create table public.closed_dates (
  id       text primary key,
  date     date not null,
  date_end date,
  repeat   boolean not null default false
);

-- =====================================================================
-- PLANS
-- =====================================================================
create table public.plans (
  id               text primary key,
  name             text not null,
  description      text,
  description_html boolean not null default false,
  days             integer,
  sessions         integer,
  price            numeric(10,2) not null default 0,
  color            text not null default '#2563eb',
  is_public        boolean not null default true,
  starred          boolean not null default false,
  is_trial         boolean not null default false,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- =====================================================================
-- PAYMENTS (financial ledger)
-- =====================================================================
create table public.payments (
  id                 text primary key,
  member_id          text not null references members (id) on update cascade on delete restrict,
  date               date not null,
  amount             numeric(10,2) not null default 0,
  note               text,
  plan_id            text,
  sessions_granted   integer,
  applied_expiration date,
  applied_start_date date,
  prev_expiration    date,
  cleared_visit_ids  text[] not null default '{}',
  created_at         timestamptz not null default now()
);

create index payments_member_idx on payments (member_id, date);

-- =====================================================================
-- NOTIFICATIONS
-- =====================================================================
create table public.notifications (
  id        text primary key,
  title     text not null,
  msg       text,
  type      text not null default 'info',
  date      timestamptz not null default now(),
  read      boolean not null default false,
  member_id text references members (id) on update cascade on delete set null
);

create index notifications_unread_idx on notifications (read) where not read;

-- =====================================================================
-- SETTINGS
-- =====================================================================
create table public.settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- RECYCLE BIN (restore + retention)
-- =====================================================================
create table public.bins (
  id          uuid primary key default gen_random_uuid(),
  entity_type bin_entity not null,
  original_id text not null,
  payload     jsonb not null,
  deleted_at  timestamptz not null default now(),
  constraint bins_entity_original_unique unique (entity_type, original_id)
);

-- =====================================================================
-- FUTURE TABLET KIOSK (PIN)
-- =====================================================================
create table public.member_pins (
  member_id  text primary key references members (id) on update cascade on delete cascade,
  pin_hash   text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- TRIGGERS
-- =====================================================================
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger members_updated_at before update on public.members
  for each row execute function public.set_updated_at();
create trigger visits_updated_at before update on public.visits
  for each row execute function public.set_updated_at();
create trigger plans_updated_at before update on public.plans
  for each row execute function public.set_updated_at();
create trigger schedules_updated_at before update on public.schedules
  for each row execute function public.set_updated_at();
create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();
create trigger member_pins_updated_at before update on public.member_pins
  for each row execute function public.set_updated_at();

-- =====================================================================
-- RPCs (replace Firestore security rules + client diff engine)
-- =====================================================================

-- Admin flag (RLS helper)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Notifications (anon-callable via SECURITY DEFINER; insert only)
create or replace function public.create_notification(
  p_title     text,
  p_msg       text default null,
  p_type      text default 'info',
  p_member_id text default null
) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (id, title, msg, type, date, read, member_id)
  values ('N-' || (extract(epoch from clock_timestamp()) * 1000)::bigint,
          p_title, p_msg, p_type, now(), false, p_member_id);
$$;

-- Member rename: single UPDATE + ON UPDATE CASCADE replaces the multi-step
-- create/update/delete chain and the memberRenames ledger.
create or replace function public.rename_member(p_old_id text, p_new_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'admin required';
  end if;
  if p_new_id is null or p_new_id = '' then
    raise exception 'new id is required';
  end if;
  if exists (select 1 from public.members where id = p_new_id) then
    raise exception 'id already taken';
  end if;
  update public.members set id = p_new_id where id = p_old_id;
  if not found then
    raise exception 'member not found';
  end if;
end $$;

-- Atomic check-in (S1 retroactive consumption, flag-not-block).
-- Replaces the client-side merge + session-decrement + notification logic.
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

  v_has_time := v_mem.expiration_date is not null
                and v_mem.expiration_date >= current_date;
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

  if v_unpaid then
    perform public.create_notification(
      'Expired/Unpaid Member Check-in',
      v_mem.first_name || ' ' || v_mem.last_name
        || ' checked in, but their visit is unpaid or they are out of sessions.',
      'danger', v_mem.id);
  end if;

  return query select v_visit_id, v_unpaid, v_mem.sessions_left, false, null::text;
end $$;

-- Payment application (S2 clear-and-flip + S1 retroactive consumption).
-- The member snapshot is derived from the ledger inside this transaction.
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
  v_days             int := null;
  v_exp              date;
  v_mem              members%rowtype;
  v_visit            visits%rowtype;
begin
  if not public.is_admin() then
    raise exception 'admin required';
  end if;

  if v_member_id is null or v_member_id = '' then
    raise exception 'memberId is required';
  end if;

  select * into v_mem from public.members where id = v_member_id for update;
  if not found then
    raise exception 'member not found';
  end if;

  if v_plan_id is not null then
    select * into v_plan from public.plans where id = v_plan_id;
    if found then
      if v_plan.days is not null and v_plan.days > 0
         and (v_plan.sessions is null or v_plan.sessions = 0) then
        v_days := v_plan.days;
      end if;
      if v_plan.sessions is not null and v_plan.sessions > 0 then
        v_sessions_granted := coalesce(v_sessions_granted, v_plan.sessions);
      end if;
    end if;
  end if;

  -- time-based coverage
  if v_days is not null and v_days > 0 then
    v_exp := coalesce(v_applied_expiration,
                      ((coalesce(v_applied_start, v_date) + v_days))::date);
    if v_mem.expiration_date is null or v_mem.expiration_date < v_exp then
      v_mem.expiration_date := v_exp;
    end if;
    v_mem.plan_days := v_days;
  end if;

  -- session grant
  if v_sessions_granted is not null and v_sessions_granted > 0 then
    v_mem.sessions_total := true;
    v_mem.sessions_left := coalesce(v_mem.sessions_left, 0) + v_sessions_granted;
    v_mem.plan_days := null;
  end if;

  -- ledger row
  insert into public.payments
    (id, member_id, date, amount, note, plan_id, sessions_granted,
     applied_expiration, applied_start_date, prev_expiration)
  values
    (v_id, v_member_id, v_date, v_amount, v_note, v_plan_id, v_sessions_granted,
     v_applied_expiration, coalesce(v_applied_start, v_date), v_prev_expiration);

  -- S1: session-based retroactive consumption, chronological
  if v_sessions_granted is not null and v_sessions_granted > 0 then
    for v_visit in
      select * from public.visits
      where member_id = v_member_id and is_unpaid
      order by entry_time asc
    loop
      if v_mem.sessions_left > 0 then
        update public.visits set is_unpaid = false where id = v_visit.id;
        v_mem.sessions_left := v_mem.sessions_left - 1;
      else
        exit;
      end if;
    end loop;
  end if;

  -- S2: clear-and-flip remaining unpaid visits inside the time window
  if v_mem.expiration_date is not null then
    update public.visits set is_unpaid = false
    where member_id = v_member_id and is_unpaid
      and entry_time::date <= v_mem.expiration_date
      and (v_applied_start is null or entry_time::date >= v_applied_start);
  end if;

  -- auto-activate on positive payment with usable coverage
  if v_mem.account_status <> 'active' and v_amount > 0 then
    if v_mem.sessions_left > 0
       or (v_mem.expiration_date is not null and v_mem.expiration_date >= current_date) then
      v_mem.account_status := 'active';
    end if;
  end if;

  update public.members
     set sessions_total = v_mem.sessions_total,
         sessions_left  = v_mem.sessions_left,
         plan_days      = v_mem.plan_days,
         expiration_date = v_mem.expiration_date,
         account_status = v_mem.account_status
   where id = v_member_id;
end $$;

-- Future tablet kiosk: PIN verification
create or replace function public.verify_member_pin(p_member_id text, p_pin text)
returns boolean
language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.member_pins
    where member_id = p_member_id and pin_hash = extensions.crypt(p_pin, pin_hash)
  );
$$;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles         enable row level security;
alter table public.members          enable row level security;
alter table public.member_private   enable row level security;
alter table public.visits           enable row level security;
alter table public.class_checkins   enable row level security;
alter table public.schedules        enable row level security;
alter table public.schedule_slots   enable row level security;
alter table public.closed_dates     enable row level security;
alter table public.plans            enable row level security;
alter table public.payments         enable row level security;
alter table public.notifications    enable row level security;
alter table public.settings         enable row level security;
alter table public.bins             enable row level security;
alter table public.member_pins      enable row level security;

-- profiles
create policy profiles_select on public.profiles for select
  using (auth.uid() = id or public.is_admin());
create policy profiles_admin on public.profiles for all
  using (public.is_admin()) with check (public.is_admin());

-- members: public read of non-deleted; admin full
create policy members_select on public.members for select
  using (deleted_at is null);
create policy members_admin on public.members for all
  using (public.is_admin()) with check (public.is_admin());

-- member_private: admin only
create policy member_private_admin on public.member_private for all
  using (public.is_admin()) with check (public.is_admin());

-- visits: anon sees all visits (no PII; member_id + timestamps only); admin all.
-- The "Currently Inside" live view filters open visits client-side / via realtime.
create policy visits_select on public.visits for select
  using (true);
create policy visits_admin on public.visits for all
  using (public.is_admin()) with check (public.is_admin());

-- class_checkins: public read (leaderboard); admin writes
create policy class_checkins_select on public.class_checkins for select
  using (true);
create policy class_checkins_admin on public.class_checkins for all
  using (public.is_admin()) with check (public.is_admin());

-- schedules: public read of visible, non-deleted; admin all
create policy schedules_select on public.schedules for select
  using ((is_public and deleted_at is null) or public.is_admin());
create policy schedules_admin on public.schedules for all
  using (public.is_admin()) with check (public.is_admin());

create policy schedule_slots_select on public.schedule_slots for select
  using (exists (select 1 from public.schedules s
                  where s.id = schedule_id and s.is_public and s.deleted_at is null)
         or public.is_admin());
create policy schedule_slots_admin on public.schedule_slots for all
  using (public.is_admin()) with check (public.is_admin());

-- closed_dates: public read; admin writes
create policy closed_dates_select on public.closed_dates for select using (true);
create policy closed_dates_admin on public.closed_dates for all
  using (public.is_admin()) with check (public.is_admin());

-- plans: public read of visible, non-deleted; admin all
create policy plans_select on public.plans for select
  using ((is_public and deleted_at is null) or public.is_admin());
create policy plans_admin on public.plans for all
  using (public.is_admin()) with check (public.is_admin());

-- payments: admin only
create policy payments_admin on public.payments for all
  using (public.is_admin()) with check (public.is_admin());

-- notifications: admin only (anon writes via create_notification RPC)
create policy notifications_admin on public.notifications for all
  using (public.is_admin()) with check (public.is_admin());

-- settings: public read; admin writes
create policy settings_select on public.settings for select using (true);
create policy settings_admin on public.settings for all
  using (public.is_admin()) with check (public.is_admin());

-- bins: admin only
create policy bins_admin on public.bins for all
  using (public.is_admin()) with check (public.is_admin());

-- member_pins: admin only (verify via RPC)
create policy member_pins_admin on public.member_pins for all
  using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- REALTIME
-- =====================================================================
alter publication supabase_realtime add table public.visits;
alter publication supabase_realtime add table public.notifications;
alter table public.visits replica identity full;
alter table public.notifications replica identity full;

-- =====================================================================
-- SEED: settings defaults
-- =====================================================================
insert into public.settings (key, value) values
  ('portal_name',             to_jsonb('🥋 BJJ Kiosk Portal'::text)),
  ('currency',                to_jsonb('€'::text)),
  ('hidden_belts',            '[]'::jsonb),
  ('checkin_notice',          to_jsonb(''::text)),
  ('checkin_notice_color',    to_jsonb('#fde68a'::text)),
  ('show_class_checkins',     'true'::jsonb),
  ('member_stats_visibility', '{"totalTrainings":true,"totalHours":true,"avgDay":true,"avgWeek":true,"avgDays":true,"avgDaysMonth":true,"avgMonth":true,"rank":true}'::jsonb)
on conflict (key) do nothing;
