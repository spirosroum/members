-- Attendance % needs to know when each class became available. Migrated
-- schedules have created_at = migration time (unreliable), so backfill
-- available_from from the earliest class check-in per class.
alter table public.schedules add column if not exists available_from date;

update public.schedules s
set available_from = coalesce(
  (select min(cc.slot_date) from public.class_checkins cc where cc.class_id = s.id),
  s.created_at::date
);
