-- =====================================================================
-- GymDesk → Supabase migration: safe admin recompute RPC
-- Provides a client-callable recompute entry point guarded by is_admin(),
-- and locks down the raw recompute_member() so non-admins cannot invoke it.
-- =====================================================================

-- Admin-only recompute wrapper the client can call (SECURITY DEFINER runs as
-- the function owner but checks the caller's auth.uid() via is_admin()).
create or replace function public.recompute_member_admin(p_member_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin required'; end if;
  if p_member_id is null or p_member_id = '' then raise exception 'memberId is required'; end if;
  perform public.recompute_member(p_member_id);
end $$;

-- Lock down the raw recompute_member so only admin-authenticated callers can
-- invoke it directly (internal calls from apply_payment / backfills still work
-- because they run as definer/owner or via this wrapper).
revoke execute on function public.recompute_member(text) from public, anon, authenticated;
grant execute on function public.recompute_member(text) to service_role;

grant execute on function public.recompute_member_admin(text) to anon, authenticated;
