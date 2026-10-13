-- 021: Workout details (beta). Optional "Start workout": exercises with sets × reps × kg.
-- One row per person per day. The exercises live in one JSON list:
--   [{"name":"Bench press","done":true,"sets":[{"reps":8,"kg":60},{"reps":8,"kg":60}]}, ...]
-- Who can see it: you, and your Buds (you bud each other). One-way spotters don't see weights.
-- Logging/notifying still happens through checkins: "Finish workout" (or the auto-finish below) adds the check-in,
-- and the existing check-in trigger sends the one "X trained" notification.

create table if not exists public.workouts (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  day         date not null,
  label       text check (label is null or char_length(label) <= 60),
  exercises   jsonb not null default '[]'::jsonb,
  started_at  timestamptz not null default now(),
  active_at   timestamptz not null default now(),      -- last change, stamped by the server (used by auto-finish)
  finished_at timestamptz,
  primary key (user_id, day),
  -- keep it sane: a list, at most 30 exercises, small enough
  constraint workouts_shape check (jsonb_typeof(exercises) = 'array' and jsonb_array_length(exercises) <= 30 and octet_length(exercises::text) <= 30000)
);
alter table public.workouts enable row level security;

-- the server stamps times (never trust the phone's clock)
create or replace function public.workout_stamp() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.started_at := now(); new.active_at := now();
    if new.finished_at is not null then new.finished_at := now(); end if;
  else
    new.started_at := old.started_at;
    if new.exercises is distinct from old.exercises or new.label is distinct from old.label then new.active_at := now(); else new.active_at := old.active_at; end if;
    if old.finished_at is not null then new.finished_at := old.finished_at;            -- once finished, stays finished
    elsif new.finished_at is not null then new.finished_at := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists workout_stamp on public.workouts;
create trigger workout_stamp before insert or update on public.workouts for each row execute function public.workout_stamp();

drop policy if exists "see my and my buds' workouts" on public.workouts;
create policy "see my and my buds' workouts" on public.workouts for select to authenticated
  using (auth.uid() = user_id or (public.is_bud(auth.uid(), user_id) and public.is_bud(user_id, auth.uid())));
drop policy if exists "write my workouts" on public.workouts;
create policy "write my workouts" on public.workouts for insert to authenticated
  with check (auth.uid() = user_id and day between public.local_today(auth.uid()) - 31 and public.local_today(auth.uid()) + 1);
drop policy if exists "edit my workouts" on public.workouts;
create policy "edit my workouts" on public.workouts for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and day between public.local_today(auth.uid()) - 31 and public.local_today(auth.uid()) + 1);
drop policy if exists "delete my workouts" on public.workouts;
create policy "delete my workouts" on public.workouts for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.workouts to authenticated;

-- Auto-finish: forgot to tap Finish? If at least one exercise is ticked and nothing changed for 2 hours,
-- or your day has ended, finish it for you: log the day (→ the normal notification) and mark it finished.
create or replace function public.finish_stale_workouts() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with stale as (
    select w.user_id, w.day from workouts w
    where w.finished_at is null
      and exists (select 1 from jsonb_array_elements(w.exercises) e where (e->>'done') = 'true')
      and (w.active_at < now() - interval '2 hours' or w.day < local_today(w.user_id))
  ), fin as (
    update workouts w set finished_at = now() from stale s where w.user_id = s.user_id and w.day = s.day returning w.user_id, w.day
  )
  insert into checkins (user_id, day) select user_id, day from fin on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.finish_stale_workouts() from public, anon, authenticated;

select cron.unschedule('finish-workouts') where exists (select 1 from cron.job where jobname = 'finish-workouts');
select cron.schedule('finish-workouts', '*/10 * * * *', 'select public.finish_stale_workouts()');

-- live updates (Buds see a finished workout appear)
do $$ begin
  alter publication supabase_realtime add table public.workouts;
exception when duplicate_object then null; end $$;
