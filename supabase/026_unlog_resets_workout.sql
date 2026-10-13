-- 026 (PREPARED, NOT YET APPLIED): unlogging a day resets that day's workout, for every app (main + beta).
-- Why: "logged" (checkins) and "workout finished" (workouts) are one fact stored in two places. The beta app
-- already does this when you unlog in the beta; this makes the database do it no matter which app unlogged.
--
-- What it touches: ONLY the workout for the SAME person and the SAME date as the removed log, and only if it was finished.
--   reset:  finished time, session length, session timer, the ✓ on exercises and sets
--   kept:   exercise names, sets, reps, weights, rest times, label (e.g. "Push"); every other day; your plans
-- Safety:
--   * Before resetting, the whole workout row is copied to workout_reset_backups (kept 30 days) → restorable.
--   * If anything in here fails, the undo still goes through (the reset is skipped, never the undo).
-- Undo this migration: see the ROLLBACK block at the bottom.

create table if not exists public.workout_reset_backups (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  day        date not null,
  workout    jsonb not null,             -- the full row exactly as it was before the reset
  reset_at   timestamptz not null default now()
);
create index if not exists workout_reset_backups_user_day on public.workout_reset_backups (user_id, day);
alter table public.workout_reset_backups enable row level security;
drop policy if exists "see my backups" on public.workout_reset_backups;
create policy "see my backups" on public.workout_reset_backups for select to authenticated using (auth.uid() = user_id);
grant select on public.workout_reset_backups to authenticated;

create or replace function public.unlog_resets_workout() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    delete from workout_reset_backups where reset_at < now() - interval '30 days';
    insert into workout_reset_backups (user_id, day, workout)
      select w.user_id, w.day, to_jsonb(w) from workouts w
      where w.user_id = old.user_id and w.day = old.day and w.finished_at is not null;
    update workouts w set
      finished_at = null, duration_s = null, session_ms = 0, session_run_at = null,
      exercises = coalesce((
        select jsonb_agg((e - 'done') || jsonb_build_object('done', false,
                 'sets', coalesce((select jsonb_agg(s - 'done') from jsonb_array_elements(e->'sets') s), '[]'::jsonb)) order by i)
        from jsonb_array_elements(w.exercises) with ordinality t(e, i)), '[]'::jsonb)
    where w.user_id = old.user_id and w.day = old.day and w.finished_at is not null;
  exception when others then
    raise warning 'unlog_resets_workout skipped: %', sqlerrm;    -- never block the undo itself
  end;
  return old;
end $$;
revoke all on function public.unlog_resets_workout() from public, anon, authenticated;
drop trigger if exists unlog_resets_workout on public.checkins;
create trigger unlog_resets_workout after delete on public.checkins for each row execute function public.unlog_resets_workout();

-- Restore one reset (run in the SQL editor; puts the workout back exactly as it was, newest backup for that day):
--   update public.workouts w set exercises = b.workout->'exercises', finished_at = (b.workout->>'finished_at')::timestamptz,
--     duration_s = (b.workout->>'duration_s')::int, session_ms = (b.workout->>'session_ms')::bigint,
--     session_run_at = (b.workout->>'session_run_at')::timestamptz
--   from (select * from public.workout_reset_backups where user_id = '<user id>' and day = '<yyyy-mm-dd>' order by reset_at desc limit 1) b
--   where w.user_id = b.user_id and w.day = b.day;
--   (Then re-log the day in the app so "logged" and "finished" agree again.)
--
-- ROLLBACK (switch the behaviour off; nothing else changes):
--   drop trigger if exists unlog_resets_workout on public.checkins;
--   drop function if exists public.unlog_resets_workout();
--   -- keep workout_reset_backups until you're sure nothing needs restoring, then: drop table public.workout_reset_backups;
