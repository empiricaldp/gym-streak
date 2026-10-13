-- 024: Workout timers (beta).
--  * Session timer: how long you're in the gym. Opening a workout does NOT start it; you tap Start.
--    Saved on the workout as "time banked so far" + "running since", so it survives closing the app.
--  * Rest timer: between sets. Your default rest + whether ticking a set starts it live on your profile.
--  * Rest alarms: when a rest starts, the phone books an alarm here. A job checks every 5 seconds and sends
--    "REST'S UP · Next: ..." through the push function, so it arrives even with the phone locked
--    (iPhone freezes web apps when locked, so the phone itself can't). The app cancels it if it's open.

-- ---------- session timer on the workout ----------
alter table public.workouts add column if not exists session_ms bigint not null default 0;           -- time banked (paused/finished parts)
alter table public.workouts add column if not exists session_run_at timestamptz;                    -- running since (null = not running)
alter table public.workouts add column if not exists duration_s integer;                            -- final length, set at finish
do $$ begin
  alter table public.workouts add constraint workouts_timer_sane check (session_ms between 0 and 86400000 and (duration_s is null or duration_s between 0 and 86400));
exception when duplicate_object then null; end $$;

-- the server's "last touched" also moves when you start/pause the timer (auto-finish uses it)
create or replace function public.workout_stamp() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.started_at := now(); new.active_at := now();
    if new.finished_at is not null then new.finished_at := now(); end if;
  else
    new.started_at := old.started_at;
    if new.exercises is distinct from old.exercises or new.label is distinct from old.label
       or new.session_ms is distinct from old.session_ms or new.session_run_at is distinct from old.session_run_at
      then new.active_at := now(); else new.active_at := old.active_at; end if;
    if old.finished_at is not null then new.finished_at := old.finished_at; new.duration_s := coalesce(new.duration_s, old.duration_s);
    elsif new.finished_at is not null then new.finished_at := now(); end if;
  end if;
  return new;
end $$;

-- Auto-finish (forgot to tap Finish): now also for timer-only sessions. Length = time banked + running time up
-- to your last tap (never "2 hours later"). Under a minute = not recorded.
create or replace function public.finish_stale_workouts() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with stale as (
    select w.user_id, w.day from workouts w
    where w.finished_at is null
      and (exists (select 1 from jsonb_array_elements(w.exercises) e where (e->>'done') = 'true')
           or w.session_ms > 0 or w.session_run_at is not null)
      and (w.active_at < now() - interval '2 hours' or w.day < local_today(w.user_id))
  ), fin as (
    update workouts w set finished_at = now(),
      duration_s = nullif(least(86400, (w.session_ms / 1000
                   + case when w.session_run_at is not null then greatest(0, extract(epoch from (w.active_at - w.session_run_at)))::bigint else 0 end)), 0)
    from stale s where w.user_id = s.user_id and w.day = s.day returning w.user_id, w.day
  )
  insert into checkins (user_id, day) select user_id, day from fin on conflict do nothing;
  get diagnostics n = row_count;
  update workouts set duration_s = null where duration_s < 60 and finished_at > now() - interval '1 minute';
  return n;
end $$;
revoke all on function public.finish_stale_workouts() from public, anon, authenticated;

-- ---------- rest settings ----------
alter table public.profiles add column if not exists rest_s integer not null default 90;      -- 0 = off
alter table public.profiles add column if not exists rest_auto boolean not null default true; -- ticking a set starts rest
do $$ begin
  alter table public.profiles add constraint profiles_rest_sane check (rest_s between 0 and 600);
exception when duplicate_object then null; end $$;

-- ---------- rest alarms ----------
create table if not exists public.rest_alarms (
  user_id  uuid primary key references public.profiles(id) on delete cascade,   -- one at a time per person
  due_at   timestamptz not null,
  title    text not null check (char_length(title) between 1 and 60),
  body     text not null check (char_length(body) between 1 and 140),
  fired_at timestamptz
);
alter table public.rest_alarms enable row level security;
drop policy if exists "my rest alarm" on public.rest_alarms;
create policy "my rest alarm" on public.rest_alarms for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and due_at between now() - interval '10 seconds' and now() + interval '20 minutes' and fired_at is null);
grant select, insert, update, delete on public.rest_alarms to authenticated;
grant select, delete on public.rest_alarms to service_role;

-- Every 5 seconds: anything due → mark it fired → ask the push function to send it (it re-reads the row).
create or replace function public.fire_rest_alarms() returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare n integer := 0; r record;
begin
  delete from rest_alarms where fired_at < now() - interval '5 minutes' or due_at < now() - interval '10 minutes';
  for r in update rest_alarms set fired_at = now() where due_at <= now() and fired_at is null returning user_id loop
    perform net.http_post(
      url     := 'https://ktmntyzswewnnxpzzuhb.supabase.co/functions/v1/push',
      body    := jsonb_build_object('type', 'rest', 'user_id', r.user_id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', (select v from push_config where k = 'hook_secret')));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.fire_rest_alarms() from public, anon, authenticated;

select cron.unschedule('rest-alarms') where exists (select 1 from cron.job where jobname = 'rest-alarms');
select cron.schedule('rest-alarms', '5 seconds', 'select public.fire_rest_alarms()');
-- keep the job log small (a 5-second job writes a lot of rows)
select cron.unschedule('cron-log-cleanup') where exists (select 1 from cron.job where jobname = 'cron-log-cleanup');
select cron.schedule('cron-log-cleanup', '17 3 * * *', $$delete from cron.job_run_details where end_time < now() - interval '2 days'$$);
