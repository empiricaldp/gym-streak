-- Migration 029: Health — meal / calorie logging (beta). Additive only; safe to run more than once.
--  * meals: one row per meal you log. Only YOU can see, add, change or delete your meals.
--    You type the energy in kcal OR kJ; the database also works out kcal (1 kcal = 4.184 kJ) so totals add up.
--  * profiles: your daily calorie goal (optional), whether totals show in kcal or kJ,
--    and the nightly summary ("Today: 1,900 kcal · 4 meals") — off by default, 10pm unless you pick a time.
--  * The existing 5-minute reminder timer also asks due_cal_summaries() who's due, so no new cron job.
-- Undo: supabase/rollback/029_rollback.sql

-- ---------- 1. meals ----------
create table if not exists public.meals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  day        date not null,                                         -- your local day (phone sends it)
  kind       text not null check (kind in ('breakfast','lunch','dinner','snack')),
  name       text check (name is null or char_length(name) between 1 and 60),
  amount     numeric(7,1) not null check (amount > 0),
  unit       text not null check (unit in ('kcal','kj')),
  kcal       numeric(7,1) generated always as (case when unit = 'kj' then round(amount / 4.184, 1) else amount end) stored,
  created_at timestamptz not null default now(),
  constraint meals_sane check ((unit = 'kcal' and amount <= 10000) or (unit = 'kj' and amount <= 41840))
);
create index if not exists meals_user_day on public.meals (user_id, day);
alter table public.meals enable row level security;
drop policy if exists "own meals" on public.meals;
create policy "own meals" on public.meals for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on public.meals from anon;
grant select, insert, update, delete on public.meals to authenticated;

-- the day must be "today-ish" for you (stops typos like a meal in 2031); yesterday is fine for late logging
create or replace function public.meal_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.day not between public.local_today(new.user_id) - 7 and public.local_today(new.user_id) + 1 then
    raise exception 'Meals can only be logged for the last week';
  end if;
  if tg_op = 'UPDATE' then new.user_id := old.user_id; new.created_at := old.created_at; end if;
  return new;
end $$;
drop trigger if exists meals_guard on public.meals;
create trigger meals_guard before insert or update on public.meals for each row execute function public.meal_guard();

-- ---------- 2. your calorie settings (profiles is already readable only by you) ----------
alter table public.profiles add column if not exists cal_goal       integer check (cal_goal is null or cal_goal between 500 and 10000);
alter table public.profiles add column if not exists energy_unit    text not null default 'kcal' check (energy_unit in ('kcal','kj'));
alter table public.profiles add column if not exists cal_notify     boolean not null default false;
alter table public.profiles add column if not exists cal_notify_at  time not null default '22:00';
alter table public.profiles add column if not exists cal_notified_on date;   -- so the summary only goes once a day

-- ---------- 3. who gets tonight's summary (called by the push function every 5 min) ----------
-- Only people who switched it on, have logged at least one meal today, have a phone subscribed,
-- and haven't had today's summary yet. Marks them as sent in the same step.
create or replace function public.due_cal_summaries() returns table (uid uuid, total_kcal numeric, meals int, unit text, goal int)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with t as (select p.id, (now() at time zone p.tz) as n from profiles p where p.cal_notify),
  due as (
    update profiles p set cal_notified_on = t.n::date
    from t
    where p.id = t.id
      and (t.n::date + p.cal_notify_at) <= t.n and (t.n::date + p.cal_notify_at) > t.n - interval '30 minutes'
      and p.cal_notified_on is distinct from t.n::date
      and exists (select 1 from meals m where m.user_id = p.id and m.day = t.n::date)
      and exists (select 1 from push_subs s where s.user_id = p.id)
    returning p.id, t.n::date as d, p.energy_unit, p.cal_goal)
  select due.id, sum(m.kcal), count(*)::int, due.energy_unit, due.cal_goal
  from due join meals m on m.user_id = due.id and m.day = due.d
  group by due.id, due.energy_unit, due.cal_goal;
end $$;
revoke all on function public.due_cal_summaries() from public, anon, authenticated;
grant execute on function public.due_cal_summaries() to service_role;
