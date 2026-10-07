-- Gym Streak database. Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to run more than once.

-- 1. PROFILES: one row per person (their name, plate colour and weekly split).
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,  -- same id as their login
  name        text not null check (char_length(name) between 1 and 20),
  plate       text not null default 'white' check (plate in ('red','blue','yellow','green','white')),
  plan        jsonb not null,                       -- 7 entries, Mon..Sun: {"w":"Push","opt":false} or null for rest
  since       date not null,                        -- Monday of their week 1
  track_start date not null,                        -- Monday they joined the app (earlier gym days count as done)
  created_at  timestamptz not null default now()
);

-- 2. CHECKINS: one row per person per day they trained.
create table if not exists public.checkins (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  day        date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)                        -- can't tick the same day twice
);

-- 3. ROW LEVEL SECURITY: the rules that protect the data.
-- Without these, anyone with the public key could edit anything. With them:
--   * any signed-in member can READ everyone (so the leaderboard works)
--   * you can only CREATE / CHANGE / DELETE your OWN rows
alter table public.profiles enable row level security;
alter table public.checkins enable row level security;

drop policy if exists "members read profiles" on public.profiles;
drop policy if exists "insert own profile"    on public.profiles;
drop policy if exists "update own profile"    on public.profiles;
drop policy if exists "members read checkins" on public.checkins;
drop policy if exists "insert own checkins"   on public.checkins;
drop policy if exists "delete own checkins"   on public.checkins;

create policy "members read profiles" on public.profiles for select to authenticated using (true);
create policy "insert own profile"    on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "update own profile"    on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "members read checkins" on public.checkins for select to authenticated using (true);
create policy "insert own checkins"   on public.checkins for insert to authenticated
  with check (auth.uid() = user_id and day <= (now() at time zone 'Australia/Sydney')::date + 1);  -- no ticking the future
create policy "delete own checkins"   on public.checkins for delete to authenticated using (auth.uid() = user_id);

-- 4. REALTIME: tell Supabase to broadcast changes, so everyone's app updates live.
do $$ begin
  begin alter publication supabase_realtime add table public.profiles; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.checkins; exception when duplicate_object then null; end;
end $$;
