-- Migration 011: profiles + buds (stage 1). ADDITIVE ONLY: nothing the live app uses is changed or removed,
-- so the current app keeps working while the beta is tested. Safe to run more than once.
--
-- Public account  → anyone can see your profile; budding you is instant (one-way, like following).
-- Private account → budding you is a request you approve; only accepted buds see your profile.

-- ---------- 1. New profile settings ----------
alter table public.profiles add column if not exists account     text check (account in ('public','private'));   -- null = not chosen yet
alter table public.profiles add column if not exists hide_split  boolean not null default false;
alter table public.profiles add column if not exists seen_update int not null default 0;                          -- "What's new" walkthrough version seen

-- Until someone picks Public/Private in the walkthrough, their OLD settings decide:
-- sharing attendance publicly = public, anything else = private. Split hidden if they hid it before.
create or replace function public.is_private(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case when account is not null then account = 'private' end, not (is_public and share_attendance), true)
  from profiles where id = uid
$$;
create or replace function public.hides_split(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when account is not null then hide_split else not share_split end from profiles where id = uid
$$;

-- ---------- 2. Buds ----------
create table if not exists public.buds (
  follower   uuid not null references public.profiles(id) on delete cascade,   -- the person who budded
  followee   uuid not null references public.profiles(id) on delete cascade,   -- the person they budded
  status     text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create index if not exists buds_followee on public.buds(followee);
alter table public.buds enable row level security;

-- The database (not the app) decides the status: public → accepted straight away, private → pending.
create or replace function public.bud_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.status := case when is_private(new.followee) then 'pending' else 'accepted' end;
  return new;
end $$;
drop trigger if exists buds_status on public.buds;
create trigger buds_status before insert on public.buds for each row execute function public.bud_status();

drop policy if exists "see my buds"    on public.buds;
drop policy if exists "add a bud"      on public.buds;
drop policy if exists "remove a bud"   on public.buds;
create policy "see my buds"  on public.buds for select to authenticated using (auth.uid() in (follower, followee));
create policy "add a bud"    on public.buds for insert to authenticated with check (auth.uid() = follower);
create policy "remove a bud" on public.buds for delete to authenticated using (auth.uid() in (follower, followee));   -- unbud, cancel, decline or remove a follower

-- Accepting a request goes through this helper, so only the person being requested can accept it
create or replace function public.accept_bud(p_follower uuid) returns void
language sql security definer set search_path = public as $$
  update buds set status = 'accepted' where follower = p_follower and followee = auth.uid();
$$;
revoke all on function public.accept_bud(uuid) from public, anon;
grant execute on function public.accept_bud(uuid) to authenticated;

-- Going public: any waiting requests are accepted automatically
create or replace function public.accept_on_public() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.account = 'public' and old.account is distinct from 'public' then
    update buds set status = 'accepted' where followee = new.id and status = 'pending';
  end if;
  return new;
end $$;
drop trigger if exists profiles_accept_on_public on public.profiles;
create trigger profiles_accept_on_public after update of account on public.profiles
  for each row execute function public.accept_on_public();

-- ---------- 3. Who can see whom ----------
create or replace function public.is_bud(viewer uuid, owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from buds where follower = viewer and followee = owner and status = 'accepted')
$$;
create or replace function public.can_see(viewer uuid, owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer = owner or not is_private(owner) or is_bud(viewer, owner)
$$;
revoke all on function public.is_private(uuid), public.hides_split(uuid), public.is_bud(uuid, uuid), public.can_see(uuid, uuid) from public, anon;
grant execute on function public.is_private(uuid), public.hides_split(uuid), public.is_bud(uuid, uuid), public.can_see(uuid, uuid) to authenticated;

-- ---------- 4. "people": everyone, with only what YOU are allowed to see about them ----------
-- (Like the old "crew" view, which stays exactly as it was for the live app.)
create or replace view public.people with (security_invoker = false) as
select
  p.id, p.name, p.plate, p.created_at,
  is_private(p.id) as private,
  can_see(auth.uid(), p.id) as visible,
  case when not can_see(auth.uid(), p.id) then null
       when p.id = auth.uid() or not hides_split(p.id) then p.plan
       else (select jsonb_agg(case when e = 'null'::jsonb then 'null'::jsonb
                                   else jsonb_build_object('w', null, 'opt', coalesce(e->'opt', 'false'::jsonb)) end order by i)
             from jsonb_array_elements(p.plan) with ordinality as t(e, i)) end as plan,
  case when can_see(auth.uid(), p.id) then p.since end as since,
  case when can_see(auth.uid(), p.id) then p.track_start end as track_start,
  hides_split(p.id) as split_hidden,
  case when p.id = auth.uid() then p.account end as account,
  case when p.id = auth.uid() then p.seen_update end as seen_update,
  (select b.status from buds b where b.follower = auth.uid() and b.followee = p.id) as i_bud,      -- my bud with them
  (select b.status from buds b where b.follower = p.id and b.followee = auth.uid()) as they_bud,   -- their bud with me
  -- Profile counts (like Instagram): Spotting = everyone they bud, Spotters = everyone who buds them,
  -- Buds = people on both lists (so a Bud also counts once in Spotting and once in Spotters)
  (select count(*) from buds x where x.follower = p.id and x.status = 'accepted'
     and exists (select 1 from buds y where y.follower = x.followee and y.followee = p.id and y.status = 'accepted'))::int as n_buds,
  (select count(*) from buds x where x.follower = p.id and x.status = 'accepted')::int as n_spotting,
  (select count(*) from buds x where x.followee = p.id and x.status = 'accepted')::int as n_spotters
from public.profiles p
where auth.uid() is not null;
revoke all on public.people from public, anon;
grant select on public.people to authenticated;

-- ---------- 5. Buds of private accounts can see their sessions (adds visibility, removes none) ----------
drop policy if exists "read checkins of people I can see" on public.checkins;
create policy "read checkins of people I can see" on public.checkins for select to authenticated
  using (public.can_see(auth.uid(), user_id));
drop policy if exists "see freezes of people I can see" on public.freezes;
create policy "see freezes of people I can see" on public.freezes for select to authenticated
  using (public.can_see(auth.uid(), user_id));
drop policy if exists "see reactions of people I can see" on public.reactions;
create policy "see reactions of people I can see" on public.reactions for select to authenticated
  using (public.can_see(auth.uid(), to_user));
drop policy if exists "react to people I can see" on public.reactions;
create policy "react to people I can see" on public.reactions for insert to authenticated
  with check (auth.uid() = from_user and public.can_see(auth.uid(), to_user)
              and day between (now() at time zone 'Australia/Sydney')::date - 7 and (now() at time zone 'Australia/Sydney')::date);
-- buds can nudge each other once a day even when private (the full new nudge rules come with the launch migration)
drop policy if exists "nudge my buds" on public.nudges;
create policy "nudge my buds" on public.nudges for insert to authenticated
  with check (auth.uid() = from_user and public.is_bud(auth.uid(), to_user)
              and day = (now() at time zone 'Australia/Sydney')::date and seen = false);

-- ---------- 6. Live updates ----------
do $$ begin
  begin alter publication supabase_realtime add table public.buds; exception when duplicate_object then null; end;
end $$;
