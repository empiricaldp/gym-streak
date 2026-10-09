-- Migration 013: Circles (WhatsApp-style groups). ADDITIVE: the live app doesn't use any of this.
-- Safe to run more than once.
--   * Not searchable. You're in when an admin adds you (straight in) or you open the invite link. Leave any time.
--   * Admins (creator + co-admins) add/remove people, rename, change emoji, reset the link, make/remove admins.
--   * Circle-mates see each other's streak, week and split (even private accounts), but "Hide my split" still hides it.
--   * Circle-mates can nudge each other once a day (Buds keep their every-10-minutes perk).

-- ---------- 1. Tables ----------
create table if not exists public.circles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 30),
  emoji       text not null default '🔥' check (char_length(emoji) between 1 and 16),
  invite_code text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 10),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create table if not exists public.circle_members (
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('admin','member')),
  muted     boolean not null default false,
  added_by  uuid references public.profiles(id) on delete set null,   -- null = joined by invite link (or created it)
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);
create index if not exists circle_members_user on public.circle_members(user_id);
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.profiles add column if not exists notif_circle boolean not null default true;

-- ---------- 2. Helpers ----------
create or replace function public.is_circle_member(c uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from circle_members where circle_id = c and user_id = u)
$$;
create or replace function public.is_circle_admin(c uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from circle_members where circle_id = c and user_id = u and role = 'admin')
$$;
create or replace function public.shares_circle(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from circle_members x join circle_members y on y.circle_id = x.circle_id
                 where x.user_id = a and y.user_id = b)
$$;

-- You see a circle + its members only if you're in it. All changes go through the functions below.
drop policy if exists "see my circles" on public.circles;
create policy "see my circles" on public.circles for select to authenticated using (public.is_circle_member(id, auth.uid()));
drop policy if exists "see my circles' members" on public.circle_members;
create policy "see my circles' members" on public.circle_members for select to authenticated using (public.is_circle_member(circle_id, auth.uid()));

-- ---------- 3. Actions ----------
create or replace function public.create_circle(p_name text, p_emoji text, p_members uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; me uuid := auth.uid();
begin
  if me is null or not exists (select 1 from profiles where id = me) then raise exception 'sign in first'; end if;
  insert into circles (name, emoji, created_by) values (btrim(p_name), coalesce(nullif(btrim(p_emoji), ''), '🔥'), me) returning id into cid;
  insert into circle_members (circle_id, user_id, role) values (cid, me, 'admin');
  insert into circle_members (circle_id, user_id, role, added_by)
    select cid, p.id, 'member', me from profiles p where p.id = any(coalesce(p_members, '{}')) and p.id <> me
    on conflict do nothing;
  return cid;
end $$;

create or replace function public.add_to_circle(p_circle uuid, p_members uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_circle_admin(p_circle, auth.uid()) then raise exception 'only admins can add people'; end if;
  insert into circle_members (circle_id, user_id, role, added_by)
    select p_circle, p.id, 'member', auth.uid() from profiles p where p.id = any(coalesce(p_members, '{}'))
    on conflict do nothing;
end $$;

create or replace function public.remove_from_circle(p_circle uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_circle_admin(p_circle, auth.uid()) then raise exception 'only admins can remove people'; end if;
  if p_user = auth.uid() then raise exception 'use leave_circle to leave'; end if;
  delete from circle_members where circle_id = p_circle and user_id = p_user;
end $$;

create or replace function public.set_circle_role(p_circle uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_circle_admin(p_circle, auth.uid()) then raise exception 'only admins can change admins'; end if;
  if p_role not in ('admin','member') then raise exception 'bad role'; end if;
  if p_role = 'member' and (select count(*) from circle_members where circle_id = p_circle and role = 'admin' and user_id <> p_user) = 0 then
    raise exception 'a circle needs at least one admin';
  end if;
  update circle_members set role = p_role where circle_id = p_circle and user_id = p_user;
end $$;

create or replace function public.edit_circle(p_circle uuid, p_name text, p_emoji text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_circle_admin(p_circle, auth.uid()) then raise exception 'only admins can edit the circle'; end if;
  update circles set name = btrim(p_name), emoji = coalesce(nullif(btrim(p_emoji), ''), emoji) where id = p_circle;
end $$;

create or replace function public.reset_invite(p_circle uuid) returns text
language plpgsql security definer set search_path = public as $$
declare code text := substr(md5(random()::text || clock_timestamp()::text), 1, 10);
begin
  if not is_circle_admin(p_circle, auth.uid()) then raise exception 'only admins can reset the link'; end if;
  update circles set invite_code = code where id = p_circle;
  return code;
end $$;

-- What an invite link shows before you join (name, emoji, how many people)
create or replace function public.circle_preview(p_code text) returns table (id uuid, name text, emoji text, members int, already boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.emoji, (select count(*) from circle_members m where m.circle_id = c.id)::int,
         is_circle_member(c.id, auth.uid())
  from circles c where c.invite_code = p_code and auth.uid() is not null
$$;

create or replace function public.join_circle(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid()) then raise exception 'sign in first'; end if;
  select id into cid from circles where invite_code = p_code;
  if cid is null then raise exception 'this invite link has expired'; end if;
  insert into circle_members (circle_id, user_id, role) values (cid, auth.uid(), 'member') on conflict do nothing;
  return cid;
end $$;

create or replace function public.leave_circle(p_circle uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from circle_members where circle_id = p_circle and user_id = auth.uid();
  if not exists (select 1 from circle_members where circle_id = p_circle) then
    delete from circles where id = p_circle;                                  -- last person out: circle goes
  elsif not exists (select 1 from circle_members where circle_id = p_circle and role = 'admin') then
    update circle_members set role = 'admin'                                  -- no admins left: longest-standing member takes over
    where circle_id = p_circle and user_id = (select user_id from circle_members where circle_id = p_circle order by joined_at, user_id limit 1);
  end if;
end $$;

create or replace function public.mute_circle(p_circle uuid, p_muted boolean) returns void
language sql security definer set search_path = public as $$
  update circle_members set muted = p_muted where circle_id = p_circle and user_id = auth.uid();
$$;

revoke all on function public.is_circle_member(uuid,uuid), public.is_circle_admin(uuid,uuid), public.shares_circle(uuid,uuid),
  public.create_circle(text,text,uuid[]), public.add_to_circle(uuid,uuid[]), public.remove_from_circle(uuid,uuid),
  public.set_circle_role(uuid,uuid,text), public.edit_circle(uuid,text,text), public.reset_invite(uuid), public.circle_preview(text),
  public.join_circle(text), public.leave_circle(uuid), public.mute_circle(uuid,boolean) from public, anon;
grant execute on function public.is_circle_member(uuid,uuid), public.is_circle_admin(uuid,uuid), public.shares_circle(uuid,uuid),
  public.create_circle(text,text,uuid[]), public.add_to_circle(uuid,uuid[]), public.remove_from_circle(uuid,uuid),
  public.set_circle_role(uuid,uuid,text), public.edit_circle(uuid,text,text), public.reset_invite(uuid), public.circle_preview(text),
  public.join_circle(text), public.leave_circle(uuid), public.mute_circle(uuid,boolean) to authenticated;

-- ---------- 4. Circle-mates can see each other (split still follows "Hide my split") ----------
create or replace function public.can_see(viewer uuid, owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer = owner or not is_private(owner) or is_bud(viewer, owner) or shares_circle(viewer, owner)
$$;

-- ---------- 5. Circle-mates can nudge each other once a day ----------
drop policy if exists "nudge circle-mates once a day" on public.nudges;
create policy "nudge circle-mates once a day" on public.nudges for insert to authenticated
  with check (auth.uid() = from_user and public.shares_circle(auth.uid(), to_user)
              and day = (now() at time zone 'Australia/Sydney')::date and seen = false
              and not public.nudged_today(auth.uid(), to_user));

-- ---------- 6. "X added you to a circle" notification ----------
drop trigger if exists push_circle_add on public.circle_members;
create trigger push_circle_add after insert on public.circle_members for each row
  when (new.added_by is not null and new.added_by <> new.user_id)
  execute function public.push_notify();

-- ---------- 7. Live updates ----------
do $$ begin
  begin alter publication supabase_realtime add table public.circles;        exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.circle_members; exception when duplicate_object then null; end;
end $$;
