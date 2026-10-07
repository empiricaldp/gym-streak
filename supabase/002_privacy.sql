-- Migration 002: privacy controls.
-- Each person chooses: share with the crew or stay private, and if sharing,
-- whether to share attendance/streaks and/or their workout split.
-- Enforced HERE in the database, so hidden data never even reaches other people's phones.
-- Safe to run more than once.

-- 1. New settings on each profile (defaults keep today's behaviour: everything shared).
alter table public.profiles add column if not exists is_public        boolean not null default true;
alter table public.profiles add column if not exists share_attendance boolean not null default true;
alter table public.profiles add column if not exists share_split      boolean not null default true;
alter table public.profiles add column if not exists privacy_chosen   boolean not null default false;

-- 2. Lock the raw profiles table down: you can only read your OWN row directly now.
drop policy if exists "members read profiles" on public.profiles;
drop policy if exists "read own profile"      on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated using (auth.uid() = id);

-- 3. Helper: does this person share their attendance with the crew?
--    "security definer" lets it check the profiles table even though rule 2 hides other rows.
create or replace function public.shares_attendance(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = uid and is_public and share_attendance)
$$;
revoke all on function public.shares_attendance(uuid) from public, anon;
grant execute on function public.shares_attendance(uuid) to authenticated;

-- 4. Check-ins: you see your own, plus those of people who share attendance.
drop policy if exists "members read checkins" on public.checkins;
drop policy if exists "read shared checkins"  on public.checkins;
create policy "read shared checkins" on public.checkins for select to authenticated
  using (auth.uid() = user_id or public.shares_attendance(user_id));

-- 5. The "crew" view: what everyone else is allowed to see about each person.
--    Private people are left out entirely. A hidden split keeps only which days are
--    gym/rest days (needed for streak maths) and blanks the workout names.
create or replace view public.crew with (security_invoker = false) as
select
  p.id, p.name, p.plate,
  case when p.id = auth.uid() or p.share_split then p.plan
       else (select jsonb_agg(
               case when e = 'null'::jsonb then 'null'::jsonb
                    else jsonb_build_object('w', null, 'opt', coalesce(e->'opt', 'false'::jsonb)) end
               order by i)
             from jsonb_array_elements(p.plan) with ordinality as t(e, i))
  end as plan,
  case when p.id = auth.uid() or p.share_attendance then p.since       end as since,
  case when p.id = auth.uid() or p.share_attendance then p.track_start end as track_start,
  p.is_public, p.share_attendance, p.share_split,
  case when p.id = auth.uid() then p.privacy_chosen else true end as privacy_chosen,
  p.created_at
from public.profiles p
where auth.uid() is not null and (p.id = auth.uid() or p.is_public);

revoke all on public.crew from public, anon;
grant select on public.crew to authenticated;
