-- Class activity history: append-only ledger recording when a class became
-- active or hidden, so past dates render as they actually were instead of
-- being inferred from the class's current (mutable) state.
create table public.schedule_activity (
  id             text primary key,
  schedule_id    text not null references public.schedules (id) on update cascade on delete cascade,
  status         text not null check (status in ('active', 'hidden')),
  effective_from date not null,
  created_at     timestamptz not null default now()
);

create index if not exists schedule_activity_schedule_idx on public.schedule_activity (schedule_id);

alter table public.schedule_activity enable row level security;

-- Public read: the kiosk calendar renders history too. Admin writes.
create policy schedule_activity_select on public.schedule_activity for select using (true);
create policy schedule_activity_admin on public.schedule_activity for all
  using (public.is_admin()) with check (public.is_admin());

-- Bootstrap one row per existing class: active since the earliest real
-- evidence of the class running (its first check-in), else the earlier of its
-- recorded activation date and creation date. available_from alone is a last
-- resort because re-activating a class overwrites it, destroying older history.
insert into public.schedule_activity (id, schedule_id, status, effective_from)
select 'ACT-' || s.id || '-SEED',
       s.id,
       'active',
       coalesce(
         (select min(cc.slot_date) from public.class_checkins cc where cc.class_id = s.id),
         least(s.available_from, s.created_at::date),
         s.created_at::date
       )
from public.schedules s
on conflict (id) do nothing;

-- Classes currently hidden get a marker effective today, so dates from today
-- onward resolve as hidden without waiting for the next client-side toggle.
insert into public.schedule_activity (id, schedule_id, status, effective_from)
select 'ACT-' || s.id || '-HIDDEN-' || to_char(now(), 'YYYYMMDD'),
       s.id,
       'hidden',
       current_date
from public.schedules s
where s.is_public = false
on conflict (id) do nothing;
