-- Migration 004: member count.
-- Everyone signed in can see how many people have joined the app (a single number, no names).
-- It counts everyone, including people who keep their profile private. Safe to run more than once.

-- (cleanup: an earlier "who's online" idea that was dropped)
drop policy if exists "members read online presence"  on realtime.messages;
drop policy if exists "members share online presence" on realtime.messages;

create or replace function public.member_count() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.profiles
$$;
revoke all on function public.member_count() from public, anon;
grant execute on function public.member_count() to authenticated;
