-- =====================================================================
-- GymDesk → Supabase migration: delete_payment gains a p_unpay flag.
--
-- Previously deleting a payment always re-marked the visits it covered as
-- unpaid. Admin may want to delete a mistaken payment record while keeping
-- the already-delivered workouts paid (e.g. the workout really happened, the
-- money was just recorded against the wrong payment).
--
-- delete_payment now takes p_unpay boolean:
--   - true  (default): un-pay the visits this payment covered, then recompute
--                      (existing behavior — covered visits revert to Unpaid).
--   - false:           delete the payment and recompute WITHOUT force-unpaying.
--                      recompute_member still re-derives coverage from the
--                      remaining ledger; visits that were paid solely by this
--                      payment and have no other backing will be preserved as
--                      "covered (no payment record)" paid rather than flipped
--                      to Unpaid (per the 000009 preservation rule).
-- =====================================================================

-- Drop the previous 2-arg overload (000010) so only the flag version remains.
drop function if exists public.delete_payment(text, text);

create or replace function public.delete_payment(p_member_id text, p_payment_id text, p_unpay boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pay   payments%rowtype;
  v_used  int := 0;
  v_visit visits%rowtype;
begin
  if not public.is_admin() then raise exception 'admin required'; end if;

  select * into v_pay from payments where id = p_payment_id and member_id = p_member_id;
  if not found then return; end if;

  -- Only when the admin opts in do we un-pay the visits this payment covered.
  if p_unpay then
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
  end if;

  delete from payments where id = p_payment_id and member_id = p_member_id;
  perform public.recompute_member(p_member_id);
end $$;
