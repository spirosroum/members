-- =====================================================================
-- GymDesk → Supabase migration: scheduled jobs
-- Requires pg_cron (enable via Supabase Dashboard → Database → Extensions).
-- =====================================================================

-- auto-checkout of stale visits (replaces client setInterval autoCheckoutStaleVisits)
select cron.schedule(
  'auto-checkout-visits',
  '* * * * *',
  $$ update public.visits
        set exit_time = expected_exit_time
      where exit_time is null and expected_exit_time <= now() $$
);

-- nightly: scrub PII for members soft-deleted > 365 days (GDPR retention)
select cron.schedule(
  'anonymize-deleted-members',
  '0 3 * * *',
  $$ update public.member_private mp
        set email = null, phone = null, dob = null, notes = null
       from public.members m
      where mp.member_id = m.id and m.deleted_at < now() - interval '365 days' $$
);

-- nightly: purge old bin snapshots
select cron.schedule(
  'purge-bins',
  '0 4 * * *',
  $$ delete from public.bins where deleted_at < now() - interval '365 days' $$
);
