-- Migration 007: several goals per person + overall gym experience. Safe to run more than once.

-- 1. goals: a list instead of one. Existing single goals are copied in.
alter table public.profiles add column if not exists goals text[] not null default '{}';
alter table public.profiles drop constraint if exists profiles_goals_check;
alter table public.profiles add constraint profiles_goals_check
  check (goals <@ array['lose','cut','maintain','bulk','recomp','strength','fitness']::text[] and cardinality(goals) <= 7);
update public.profiles set goals = array[goal] where goal is not null and cardinality(goals) = 0;

-- 2. When you started going to the gym at all (separate from your streak start, "since").
--    Private like the rest of your profile row: only you can read it.
alter table public.profiles add column if not exists trained_since date
  check (trained_since > date '1950-01-01');
