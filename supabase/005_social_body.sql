-- Migration 005: goals, private body tracking, reactions, nudges and streak freezes.
-- Safe to run more than once.

-- ---------- 1. Goal + height (on your own profile row, which only you can read) ----------
alter table public.profiles add column if not exists goal text
  check (goal in ('lose','cut','maintain','bulk','recomp','strength','fitness'));
alter table public.profiles add column if not exists height_cm numeric(5,1)
  check (height_cm between 100 and 250);

-- ---------- 2. Bodyweight log: PRIVATE, only you can see or change yours ----------
create table if not exists public.bodyweight (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  day        date not null,
  kg         numeric(5,1) not null check (kg between 25 and 350),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.bodyweight enable row level security;
drop policy if exists "own bodyweight" on public.bodyweight;
create policy "own bodyweight" on public.bodyweight for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- 3. Reactions on someone's session ----------
create table if not exists public.reactions (
  from_user  uuid not null references public.profiles(id) on delete cascade,
  to_user    uuid not null references public.profiles(id) on delete cascade,
  day        date not null,
  emoji      text not null check (emoji in ('fire','muscle','clap')),
  created_at timestamptz not null default now(),
  primary key (from_user, to_user, day, emoji),
  check (from_user <> to_user)
);
alter table public.reactions enable row level security;
drop policy if exists "see reactions"   on public.reactions;
drop policy if exists "add reactions"   on public.reactions;
drop policy if exists "undo reactions"  on public.reactions;
-- visible when you sent or got it, or when the receiver shares attendance with the crew
create policy "see reactions" on public.reactions for select to authenticated
  using (auth.uid() in (from_user, to_user) or public.shares_attendance(to_user));
-- you can only react as yourself, to someone who shares attendance, within the last week
create policy "add reactions" on public.reactions for insert to authenticated
  with check (auth.uid() = from_user and public.shares_attendance(to_user)
              and day between (now() at time zone 'Australia/Sydney')::date - 7 and (now() at time zone 'Australia/Sydney')::date);
create policy "undo reactions" on public.reactions for delete to authenticated using (auth.uid() = from_user);

-- ---------- 4. Nudges: "get to the gym" pokes, one per person per day ----------
create table if not exists public.nudges (
  from_user  uuid not null references public.profiles(id) on delete cascade,
  to_user    uuid not null references public.profiles(id) on delete cascade,
  day        date not null default (now() at time zone 'Australia/Sydney')::date,
  seen       boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (from_user, to_user, day),
  check (from_user <> to_user)
);
alter table public.nudges enable row level security;
drop policy if exists "see own nudges"   on public.nudges;
drop policy if exists "send nudges"      on public.nudges;
drop policy if exists "mark nudges seen" on public.nudges;
create policy "see own nudges" on public.nudges for select to authenticated
  using (auth.uid() in (from_user, to_user));
create policy "send nudges" on public.nudges for insert to authenticated
  with check (auth.uid() = from_user and public.shares_attendance(to_user)
              and day = (now() at time zone 'Australia/Sydney')::date and seen = false);
create policy "mark nudges seen" on public.nudges for update to authenticated
  using (auth.uid() = to_user) with check (auth.uid() = to_user);

-- ---------- 5. Streak freezes: one per calendar month, for a day in the last week ----------
create table if not exists public.freezes (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  day        date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.freezes enable row level security;
drop policy if exists "see freezes"   on public.freezes;
drop policy if exists "use a freeze"  on public.freezes;
drop policy if exists "undo a freeze" on public.freezes;
-- the crew needs to see freezes to work out each other's streaks
create policy "see freezes" on public.freezes for select to authenticated
  using (auth.uid() = user_id or public.shares_attendance(user_id));

-- one-per-month check lives in a helper so it can count ALL of your freezes
create or replace function public.freeze_allowed(uid uuid, d date) returns boolean
language sql stable security definer set search_path = public as $$
  select d between (now() at time zone 'Australia/Sydney')::date - 7 and (now() at time zone 'Australia/Sydney')::date
     and not exists (select 1 from public.freezes f
                     where f.user_id = uid and date_trunc('month', f.day) = date_trunc('month', d))
$$;
revoke all on function public.freeze_allowed(uuid, date) from public, anon;
grant execute on function public.freeze_allowed(uuid, date) to authenticated;

create policy "use a freeze" on public.freezes for insert to authenticated
  with check (auth.uid() = user_id and public.freeze_allowed(user_id, day));
create policy "undo a freeze" on public.freezes for delete to authenticated using (auth.uid() = user_id);

-- ---------- 6. Live updates ----------
do $$ begin
  begin alter publication supabase_realtime add table public.reactions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.nudges;    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.freezes;   exception when duplicate_object then null; end;
end $$;
