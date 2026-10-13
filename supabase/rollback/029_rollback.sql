-- Undo 029 (meals / calories). Deletes all logged meals, so only run if 029 must be removed.
drop function if exists public.due_cal_summaries();
drop trigger if exists meals_guard on public.meals;
drop function if exists public.meal_guard();
drop table if exists public.meals;
alter table public.profiles drop column if exists cal_goal, drop column if exists energy_unit,
  drop column if exists cal_notify, drop column if exists cal_notify_at, drop column if exists cal_notified_on;
