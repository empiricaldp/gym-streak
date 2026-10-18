-- Migration 032: Macros — protein, carbs and fat on meals (beta/main v56). Additive; safe to run more than once.
--  * Each meal can now have protein / carbs / fat in grams, all optional.
--  * A meal needs at least ONE thing: energy (kcal or kJ) OR protein OR carbs OR fat ("just 30 g protein" is fine).
--  * Calories for a meal: the energy you typed; if you left it empty but gave all three macros, it's worked out
--    (4 kcal/g protein, 4 kcal/g carbs, 9 kcal/g fat). Only some macros and no energy = no calories counted.
--  * Optional daily goals for each, on your profile (readable only by you).
-- Undo: supabase/rollback/032_rollback.sql

alter table public.meals add column if not exists protein_g numeric(6,1) check (protein_g is null or protein_g between 0 and 1000);
alter table public.meals add column if not exists carbs_g   numeric(6,1) check (carbs_g   is null or carbs_g   between 0 and 1000);
alter table public.meals add column if not exists fat_g     numeric(6,1) check (fat_g     is null or fat_g     between 0 and 1000);
alter table public.meals alter column amount drop not null;
alter table public.meals alter column unit drop not null;
do $$ begin
  alter table public.meals add constraint meals_something check (amount is not null or protein_g is not null or carbs_g is not null or fat_g is not null);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.meals add constraint meals_unit_with_amount check (amount is null or unit is not null);
exception when duplicate_object then null; end $$;

-- kcal now also comes from the macros when there's no energy typed (generated columns can't be altered: rebuild it)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'meals' and column_name = 'kcal'
                 and generation_expression ilike '%fat_g%') then
    alter table public.meals drop column if exists kcal;
    alter table public.meals add column kcal numeric(7,1) generated always as (
      case when amount is not null then (case when unit = 'kj' then round(amount / 4.184, 1) else amount end)
           when protein_g is not null and carbs_g is not null and fat_g is not null then round(protein_g * 4 + carbs_g * 4 + fat_g * 9, 1)
           else null end) stored;
  end if;
end $$;

alter table public.profiles add column if not exists protein_goal integer check (protein_goal is null or protein_goal between 1 and 1000);
alter table public.profiles add column if not exists carbs_goal   integer check (carbs_goal   is null or carbs_goal   between 1 and 1000);
alter table public.profiles add column if not exists fat_goal     integer check (fat_goal     is null or fat_goal     between 1 and 1000);

-- the nightly total: a day with only macro-logged meals still counts as "logged a meal"; total uses the kcal we know
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
  select due.id, coalesce(sum(m.kcal), 0), count(*)::int, due.energy_unit, due.cal_goal
  from due join meals m on m.user_id = due.id and m.day = due.d
  group by due.id, due.energy_unit, due.cal_goal;
end $$;
revoke all on function public.due_cal_summaries() from public, anon, authenticated;
grant execute on function public.due_cal_summaries() to service_role;
