-- Migration 033: a meal's calories are only what was typed (beta b68). Safe to run more than once.
--  032 worked calories out from protein/carbs/fat when energy was empty; DP decided against that:
--  a macros-only meal now counts 0 calories (the app shows a * instead of a number).
--  Only the generated kcal column changes (it's always recomputed from amount/unit, so no data is lost).
-- Undo: supabase/rollback/033_rollback.sql
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'meals' and column_name = 'kcal'
             and generation_expression ilike '%fat_g%') then
    alter table public.meals drop column kcal;
    alter table public.meals add column kcal numeric(7,1) generated always as (
      case when unit = 'kj' then round(amount / 4.184, 1) else amount end) stored;
  end if;
end $$;
