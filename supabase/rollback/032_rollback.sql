-- Undo 032 (macros). Meals logged with ONLY macros (no energy) are deleted first, because 029 needs energy on every meal.
-- Macro numbers on other meals are lost. Run only if 032 must be removed.
delete from public.meals where amount is null;
alter table public.meals drop constraint if exists meals_something;
alter table public.meals drop constraint if exists meals_unit_with_amount;
alter table public.meals drop column if exists kcal;
alter table public.meals add column kcal numeric(7,1) generated always as (case when unit = 'kj' then round(amount / 4.184, 1) else amount end) stored;
alter table public.meals drop column if exists protein_g, drop column if exists carbs_g, drop column if exists fat_g;
alter table public.meals alter column amount set not null;
alter table public.meals alter column unit set not null;
alter table public.profiles drop column if exists protein_goal, drop column if exists carbs_goal, drop column if exists fat_goal;
