-- Migration 003: Apple Health steps via an iPhone Shortcut.
-- The Shortcut can't log in like the app does, so each person gets a secret "steps key".
-- The Shortcut sends {key, steps} to log_steps(), which checks the key and saves the count.
-- Safe to run more than once.

-- 1. Settings on each profile
alter table public.profiles add column if not exists steps_token uuid not null default gen_random_uuid();
alter table public.profiles add column if not exists share_steps boolean not null default false;  -- health data: private by default
create unique index if not exists profiles_steps_token_key on public.profiles (steps_token);

-- 2. One row per person per day
create table if not exists public.steps (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  day        date not null,
  count      integer not null check (count between 0 and 200000),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.steps enable row level security;

-- 3. Who can see whose steps: yourself, plus people who chose to share steps
create or replace function public.shares_steps(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = uid and is_public and share_steps)
$$;
revoke all on function public.shares_steps(uuid) from public, anon;
grant execute on function public.shares_steps(uuid) to authenticated;

drop policy if exists "read shared steps" on public.steps;
create policy "read shared steps" on public.steps for select to authenticated
  using (auth.uid() = user_id or public.shares_steps(user_id));
-- No insert/update/delete policies: the ONLY way in is log_steps() below.

-- 4. The endpoint the Shortcut calls: POST /rest/v1/rpc/log_steps  {"p_key": "...", "p_steps": 1234}
--    p_steps is numeric because Health sums can come through as 8421.0; we round it here.
drop function if exists public.log_steps(uuid, integer, date);
create or replace function public.log_steps(p_key uuid, p_steps numeric, p_day date default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  today_syd date := (now() at time zone 'Australia/Sydney')::date;
  d date := coalesce(p_day, today_syd);
  n integer;
begin
  select id into uid from public.profiles where steps_token = p_key;
  if uid is null then raise exception 'Unknown steps key. Copy your link again from the app (You tab).'; end if;
  if p_steps is null or p_steps < 0 or p_steps > 200000 then raise exception 'Step count looks wrong: %', p_steps; end if;
  if d > today_syd + 1 or d < today_syd - 7 then raise exception 'Date must be within the last week'; end if;
  n := round(p_steps)::integer;
  insert into public.steps (user_id, day, count, updated_at) values (uid, d, n, now())
  on conflict (user_id, day) do update set count = excluded.count, updated_at = now();
  return 'Saved ' || n || ' steps for ' || to_char(d, 'Dy DD Mon');
end $$;
revoke all on function public.log_steps(uuid, numeric, date) from public;
grant execute on function public.log_steps(uuid, numeric, date) to anon, authenticated;

-- 5. Make a new key if yours leaks (old Shortcut links stop working)
create or replace function public.reset_steps_key() returns uuid
language plpgsql security definer set search_path = public as $$
declare k uuid := gen_random_uuid();
begin
  update public.profiles set steps_token = k where id = auth.uid();
  return k;
end $$;
revoke all on function public.reset_steps_key() from public, anon;
grant execute on function public.reset_steps_key() to authenticated;

-- 6. Add share_steps to the crew view (new columns must go at the end)
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
  p.created_at,
  p.share_steps
from public.profiles p
where auth.uid() is not null and (p.id = auth.uid() or p.is_public);

revoke all on public.crew from public, anon;
grant select on public.crew to authenticated;

-- 7. Live updates for steps too
do $$ begin
  begin alter publication supabase_realtime add table public.steps; exception when duplicate_object then null; end;
end $$;
