-- 027 (PREPARED, NOT YET APPLIED): Block + Report — the safety basics before strangers can join.
--
-- BLOCK (either direction counts: if A blocks B, neither can reach the other):
--   * profile/streak/split: hidden (can_see → false)          * Everyone list / search: they disappear from each other
--   * Buds/Spotting/Spotters: removed both ways at once        * new bud requests: refused
--   * direct messages: can't send; old DMs hidden both ways    * nudges + reactions: refused
--   * circles: can't add each other; in a SHARED circle you both stay members (the circle isn't yours alone).
--     Their circle messages are hidden for the blocker by the app, and the push function skips notifying the blocker
--     about the blocked person (push function change, separate deploy).
--   * The blocked person is NOT told. Unblocking does NOT restore old Buds (they'd need to bud again).
-- REPORT: anyone can report a person (optionally a specific message) with a reason. Max 10 reports a day per person.
--   Reports are private to the reporter; DP reviews them in the dashboard (open_reports view, admins only).
--
-- How: new "restrictive" policies are ANDed with the existing ones, so no existing rule is rewritten.
-- ROLLBACK block at the bottom.

-- ---------- blocks ----------
create table if not exists public.blocks (
  blocker    uuid not null references public.profiles(id) on delete cascade,
  blocked    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index if not exists blocks_blocked on public.blocks (blocked);
alter table public.blocks enable row level security;
drop policy if exists "my blocks" on public.blocks;
create policy "my blocks" on public.blocks for all to authenticated
  using (auth.uid() = blocker) with check (auth.uid() = blocker);     -- you only ever see YOUR block list
grant select, insert, delete on public.blocks to authenticated;

create or replace function public.blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;
revoke all on function public.blocked_between(uuid, uuid) from public, anon;
grant execute on function public.blocked_between(uuid, uuid) to authenticated, service_role;

-- blocking removes every bud link between the two, both directions
create or replace function public.block_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from buds where (follower = new.blocker and followee = new.blocked) or (follower = new.blocked and followee = new.blocker);
  return new;
end $$;
revoke all on function public.block_cleanup() from public, anon, authenticated;
drop trigger if exists block_cleanup on public.blocks;
create trigger block_cleanup after insert on public.blocks for each row execute function public.block_cleanup();

-- your block list with names (the people view hides blocked people, so the list needs its own door)
create or replace function public.my_blocks() returns table (id uuid, name text, plate text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.plate, b.created_at from blocks b join profiles p on p.id = b.blocked
  where b.blocker = auth.uid() order by b.created_at desc
$$;
revoke all on function public.my_blocks() from public, anon;
grant execute on function public.my_blocks() to authenticated;

-- ---------- visibility ----------
create or replace function public.can_see(viewer uuid, owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer = owner or (not blocked_between(viewer, owner)
    and (not is_private(owner) or is_bud(viewer, owner) or shares_circle(viewer, owner)))
$$;
create or replace function public.can_add_to_circle(adder uuid, who uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not blocked_between(adder, who) and (not is_private(who) or (is_bud(adder, who) and is_bud(who, adder)))
$$;

-- people view: blocked people disappear from each other's lists (same columns as before, one extra filter)
do $$
declare v text := pg_get_viewdef('public.people'::regclass);
begin
  if position('blocked_between' in v) = 0 then
    v := regexp_replace(v, 'WHERE \(auth\.uid\(\) IS NOT NULL\);?\s*$', 'WHERE ((auth.uid() IS NOT NULL) AND ((p.id = auth.uid()) OR (NOT blocked_between(auth.uid(), p.id))));');
    if position('blocked_between' in v) = 0 then raise exception 'people view: expected WHERE clause not found; not changing it'; end if;
    execute 'create or replace view public.people as ' || v;
  end if;
end $$;

-- ---------- the "not blocked" rules (ANDed with the existing ones) ----------
drop policy if exists "no bud if blocked" on public.buds;
create policy "no bud if blocked" on public.buds as restrictive for insert to authenticated
  with check (not blocked_between(follower, followee));
drop policy if exists "no DM if blocked" on public.messages;
create policy "no DM if blocked" on public.messages as restrictive for insert to authenticated
  with check (to_user is null or not blocked_between(auth.uid(), to_user));
drop policy if exists "hide DMs if blocked" on public.messages;
create policy "hide DMs if blocked" on public.messages as restrictive for select to authenticated
  using (to_user is null or not blocked_between(from_user, to_user));
drop policy if exists "no nudge if blocked" on public.nudges;
create policy "no nudge if blocked" on public.nudges as restrictive for insert to authenticated
  with check (not blocked_between(from_user, to_user));
drop policy if exists "no reaction if blocked" on public.reactions;
create policy "no reaction if blocked" on public.reactions as restrictive for insert to authenticated
  with check (not blocked_between(from_user, to_user));

-- reading: the older "shared attendance" rules would still let a blocked person read a PUBLIC account's
-- check-ins, freezes and reactions, so blocking also has to win when reading those
drop policy if exists "hide checkins if blocked" on public.checkins;
create policy "hide checkins if blocked" on public.checkins as restrictive for select to authenticated
  using (not blocked_between(auth.uid(), user_id));
drop policy if exists "hide freezes if blocked" on public.freezes;
create policy "hide freezes if blocked" on public.freezes as restrictive for select to authenticated
  using (not blocked_between(auth.uid(), user_id));
drop policy if exists "hide reactions if blocked" on public.reactions;
create policy "hide reactions if blocked" on public.reactions as restrictive for select to authenticated
  using (not blocked_between(auth.uid(), to_user) and not blocked_between(auth.uid(), from_user));

-- ---------- reports ----------
create table if not exists public.reports (
  id           bigint generated always as identity primary key,
  reporter     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target_user  uuid not null references public.profiles(id) on delete cascade,
  message_id   bigint references public.messages(id) on delete set null,
  message_body text,                                        -- copied by the server, so the evidence can't be faked or lost
  reason       text not null check (reason in ('spam', 'harassment', 'inappropriate', 'fake', 'underage', 'other')),
  details      text check (details is null or char_length(details) <= 500),
  status       text not null default 'open' check (status in ('open', 'reviewed', 'actioned', 'dismissed')),
  created_at   timestamptz not null default now(),
  check (reporter <> target_user)
);
alter table public.reports enable row level security;
create or replace function public.reports_today(uid uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from reports where reporter = uid and created_at > now() - interval '24 hours'
$$;
revoke all on function public.reports_today(uuid) from public, anon;
grant execute on function public.reports_today(uuid) to authenticated;
drop policy if exists "file a report" on public.reports;
create policy "file a report" on public.reports for insert to authenticated
  with check (reporter = auth.uid() and status = 'open' and reports_today(auth.uid()) < 10);
drop policy if exists "see my reports" on public.reports;
create policy "see my reports" on public.reports for select to authenticated using (reporter = auth.uid());
grant select, insert on public.reports to authenticated;

-- the server fills in the reported message's text (only if the reporter could actually read that message
-- and it was sent by the person being reported)
create or replace function public.report_fill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.status := 'open';
  if new.message_id is not null then
    select m.body into new.message_body from messages m
    where m.id = new.message_id and m.from_user = new.target_user
      and (m.to_user = new.reporter or (m.circle_id is not null and is_circle_member(m.circle_id, new.reporter)));
    if new.message_body is null then new.message_id := null; end if;   -- not a message you could see from them
  end if;
  return new;
end $$;
revoke all on function public.report_fill() from public, anon, authenticated;
drop trigger if exists report_fill on public.reports;
create trigger report_fill before insert on public.reports for each row execute function public.report_fill();

-- for DP in the dashboard (service role / SQL editor only — no app user can read this)
create or replace view public.open_reports as
  select r.id, r.created_at, r.reason, r.details, r.message_body,
         rp.name as reporter_name, tp.name as reported_name, r.reporter, r.target_user
  from reports r join profiles rp on rp.id = r.reporter join profiles tp on tp.id = r.target_user
  where r.status = 'open' order by r.created_at;
revoke all on public.open_reports from public, anon, authenticated;

-- ROLLBACK:
--   drop view if exists public.open_reports; drop trigger if exists report_fill on public.reports; drop function if exists public.report_fill();
--   drop policy "no bud if blocked" on public.buds; drop policy "no DM if blocked" on public.messages; drop policy "hide DMs if blocked" on public.messages;
--   drop policy "no nudge if blocked" on public.nudges; drop policy "no reaction if blocked" on public.reactions;
--   drop policy "hide checkins if blocked" on public.checkins; drop policy "hide freezes if blocked" on public.freezes; drop policy "hide reactions if blocked" on public.reactions;
--   restore can_see / can_add_to_circle / people from 011, 017 and 020 (they're unchanged apart from the blocked_between check);
--   drop trigger block_cleanup on public.blocks; then keep or drop tables blocks + reports (they hold user data: export first).
