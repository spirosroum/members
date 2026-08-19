-- =====================================================================
-- GymDesk → Supabase migration: one-off schedule overrides
-- Allows an admin to override a single class instance on a specific date
-- (replace it with another existing class, or set custom name/details)
-- WITHOUT touching the recurring weekly schedule.
-- =====================================================================

create table if not exists public.schedule_overrides (
  id                   text primary key,
  schedule_id          text not null references schedules (id) on update cascade on delete cascade,
  date                 date not null,
  replacement_class_id text null,
  name                 text null,
  description          text null,
  color                text null,
  cancelled            boolean not null default false,
  created_at           timestamptz not null default now(),
  unique (schedule_id, date)
);

create index schedule_overrides_date_idx on schedule_overrides (date);

-- RLS: readable by everyone (member portal computes attendance % client-side),
-- writable only by admins.
alter table public.schedule_overrides enable row level security;

create policy schedule_overrides_select on public.schedule_overrides
  for select using (true);
create policy schedule_overrides_admin on public.schedule_overrides
  for all using (public.is_admin()) with check (public.is_admin());
