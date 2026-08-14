-- Add the holiday/reason label to closed dates (was captured in the form but never persisted).
alter table public.closed_dates add column if not exists reason text;
