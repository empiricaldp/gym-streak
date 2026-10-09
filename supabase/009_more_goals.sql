-- Migration 009: two more goals, "be happy" and "keep an eye on my friends". Safe to run more than once.
alter table public.profiles drop constraint if exists profiles_goals_check;
alter table public.profiles add constraint profiles_goals_check
  check (goals <@ array['lose','cut','maintain','bulk','recomp','strength','fitness','happy','friends']::text[]
         and cardinality(goals) <= 9);
-- (the old single "goal" column keeps its original 7 values; the app only copies one of those into it)
