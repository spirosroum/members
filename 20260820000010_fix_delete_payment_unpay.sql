-- =====================================================================
-- GymDesk → Supabase migration: deleting a payment re-marks its visits unpaid.
--
-- The 000009 recompute fix preserves "paid: covered (no payment record)" visits
-- (paid, no override, not attributable to a covering time window). Because
-- recompute cannot distinguish such a visit from one that is paid solely by a
-- session-quota payment (both are paid with no covering time window), deleting
-- a session payment left its visits "covered (no payment record)" instead of
-- reverting them to Unpaid.
--
-- Fix: delete_payment now explicitly un-pays the visits the deleted payment
-- covered (time-window visits, or the first N session-quota visits) BEFORE
-- recompute, so those visits are no longer "currently paid" and are not
-- preserved. recompute then re-covers any still-covered by remaining payments,
-- and genuine "covered (no payment record)" visits (not covered by the deleted
-- payment) stay preserved.
-- =====================================================================

create or replace function public.delete_payment(p_member_id text, p_payment_id text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pay   payments%rowtype;
  v_used  int := 0;
  v_visit visits%rowtype;
begin
  if not public.is_admin() then raise exception 'admin required'; end if;

  select * into v_pay from payments where id = p_payment_id and member_id = p_member_id;
  if not found then return; end if;

  -- Un-pay the visits this payment covered before recompute, so the 000009
  -- preservation logic does not keep them paid once the payment is gone.
  if v_pay.applied_expiration is not null and coalesce(v_pay.sessions_granted, 0) = 0 then
    -- Time-based payment: un-pay visits inside its [start, expiration] window.
    update visits set is_unpaid = true
    where member_id = p_member_id
      and paid_override is null
      and (entry_time at time zone 'Europe/Athens')::date >= coalesce(v_pay.applied_start_date, v_pay.date)
      and (entry_time at time zone 'Europe/Athens')::date <= v_pay.applied_expiration;
  elsif coalesce(v_pay.sessions_granted, 0) > 0 then
    -- Session payment: un-pay the first N eligible visits chronologically
    -- (matching recompute's session-quota walk). recompute re-derives after.
    for v_visit in
      select v.* from visits v
      where v.member_id = p_member_id
        and v.paid_override is null
        and not exists (
          select 1 from payments p
          where p.member_id = p_member_id
            and p.applied_expiration is not null
            and coalesce(p.sessions_granted, 0) = 0
            and p.applied_start_date is not null
            and (v.entry_time at time zone 'Europe/Athens')::date >= p.applied_start_date
            and (v.entry_time at time zone 'Europe/Athens')::date <= p.applied_expiration
        )
      order by v.entry_time asc
    loop
      if v_used < coalesce(v_pay.sessions_granted, 0) then
        v_used := v_used + 1;
        update visits set is_unpaid = true where id = v_visit.id;
      else
        exit;
      end if;
    end loop;
  end if;

  delete from payments where id = p_payment_id and member_id = p_member_id;
  perform public.recompute_member(p_member_id);
end $$;
