-- 022: Workout plans (beta). You write your workout ONCE per split day ("Push": Bench 3×8 @ 60kg, ...).
-- "Start workout" opens it already filled in, so nobody types mid-set. Finishing a workout updates the plan to
-- that day's numbers, so next time is ready too. Plans are private (only you). Weights are stored in kg;
-- weight_unit is just how YOU like to see them (kg or lb).

alter table public.profiles add column if not exists weight_unit text not null default 'kg';
do $$ begin
  alter table public.profiles add constraint profiles_weight_unit check (weight_unit in ('kg', 'lb'));
exception when duplicate_object then null; end $$;

create table if not exists public.workout_plans (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  label      text not null check (char_length(btrim(label)) between 1 and 60),
  key        text generated always as (lower(btrim(label))) stored,     -- "Push" and "push " are the same plan
  exercises  jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key),
  constraint workout_plans_shape check (jsonb_typeof(exercises) = 'array' and jsonb_array_length(exercises) <= 30 and octet_length(exercises::text) <= 30000)
);
alter table public.workout_plans enable row level security;
drop policy if exists "my plans" on public.workout_plans;
create policy "my plans" on public.workout_plans for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.workout_plans to authenticated;

create or replace function public.plan_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists plan_touch on public.workout_plans;
create trigger plan_touch before insert or update on public.workout_plans for each row execute function public.plan_touch();
