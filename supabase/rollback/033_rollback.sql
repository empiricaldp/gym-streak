-- Undo 033: calories worked out from macros again when energy is empty (032 behaviour).
alter table public.meals drop column if exists kcal;
alter table public.meals add column kcal numeric(7,1) generated always as (
  case when amount is not null then (case when unit = 'kj' then round(amount / 4.184, 1) else amount end)
       when protein_g is not null and carbs_g is not null and fat_g is not null then round(protein_g * 4 + carbs_g * 4 + fat_g * 9, 1)
       else null end) stored;
