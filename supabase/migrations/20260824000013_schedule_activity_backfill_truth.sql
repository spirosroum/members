-- =====================================================================
-- Manual truth backfill for schedule_activity.
-- Run AFTER 20260824000012_schedule_activity.sql (it replaces that
-- migration's inferred seed rows for the classes listed below).
--
-- Real activation history as of 2026-08-24, per the gym owner:
--   Advanced / Competition / Wrestling / Kids*:  never active yet
--   Open Mat:      active from 2026-08-24 onward
--   Fundamentals + Leg Locks:
--     active 2026-08-03 .. 2026-08-23,
--     hidden from 2026-08-24,
--     re-active from 2026-08-31
--   Leg Locks: one-off cancellation on Tuesday 2026-08-18
--
-- Idempotent: safe to re-run. Matches classes by name (ilike), so
-- review the SELECT at the bottom to confirm every class matched.
-- =====================================================================

-- 1) Never-activated classes: clear any ledger rows, mark hidden since forever
delete from public.schedule_activity a
using public.schedules s
where a.schedule_id = s.id
  and (s.name ilike 'advanced%'
    or s.name ilike 'competition%'
    or s.name ilike 'wrestling%'
    or s.name ilike '%kids%');

insert into public.schedule_activity (id, schedule_id, status, effective_from)
select 'ACT-' || s.id || '-NEVER', s.id, 'hidden', '1970-01-01'::date
from public.schedules s
where s.name ilike 'advanced%'
   or s.name ilike 'competition%'
   or s.name ilike 'wrestling%'
   or s.name ilike '%kids%'
on conflict (id) do nothing;

-- 2) Open Mat: active from today only
delete from public.schedule_activity a
using public.schedules s
where a.schedule_id = s.id and s.name ilike '%open mat%';

insert into public.schedule_activity (id, schedule_id, status, effective_from)
select 'ACT-' || s.id || '-OPENMAT', s.id, 'active', '2026-08-24'::date
from public.schedules s
where s.name ilike '%open mat%'
on conflict (id) do nothing;

-- 3) Fundamentals + Leg Locks: on Aug 3 - Aug 23, off Aug 24+, back Aug 31
delete from public.schedule_activity a
using public.schedules s
where a.schedule_id = s.id
  and (s.name ilike 'fundamentals%' or s.name ilike '%leg%lock%');

insert into public.schedule_activity (id, schedule_id, status, effective_from)
select 'ACT-' || s.id || '-ON-AUG03', s.id, 'active', '2026-08-03'::date
from public.schedules s where s.name ilike 'fundamentals%' or s.name ilike '%leg%lock%'
union all
select 'ACT-' || s.id || '-OFF-AUG24', s.id, 'hidden', '2026-08-24'::date
from public.schedules s where s.name ilike 'fundamentals%' or s.name ilike '%leg%lock%'
union all
select 'ACT-' || s.id || '-ON-AUG31', s.id, 'active', '2026-08-31'::date
from public.schedules s where s.name ilike 'fundamentals%' or s.name ilike '%leg%lock%'
on conflict (id) do nothing;

-- 4) Leg Locks: cancelled on Tuesday 2026-08-18 (one-off override),
--    unless that date already has an override recorded
insert into public.schedule_overrides (id, schedule_id, date, cancelled)
select 'OVR-' || s.id || '-20260818-CANCEL', s.id, '2026-08-18'::date, true
from public.schedules s
where s.name ilike '%leg%lock%'
  and not exists (
      select 1 from public.schedule_overrides o
      where o.schedule_id = s.id and o.date = '2026-08-18'
  )
on conflict (id) do nothing;

-- 5) Verify: every class should show its full timeline
-- select s.name, a.status, a.effective_from
-- from public.schedule_activity a
-- join public.schedules s on s.id = a.schedule_id
-- order by s.name, a.effective_from;
