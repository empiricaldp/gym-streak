-- 026 (PREPARED, NOT YET APPLIED): unlogging a day resets that day's workout, for every client.
-- Why: "logged" (checkins) and "workout finished" (workouts) are one fact stored in two places. The beta app
-- resets the workout when YOU unlog in the beta, and repairs drift when it loads; but an unlog from the main app
-- (or any future client) should be handled where the data lives: here.
-- Effect: delete a checkin → that day's workout (if any) becomes unfinished, timer 0, no ticks. Exercises are kept.
create or replace function public.unlog_resets_workout() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update workouts w set
    finished_at = null, duration_s = null, session_ms = 0, session_run_at = null,
    exercises = coalesce((
      select jsonb_agg((e - 'done') || jsonb_build_object('done', false,
               'sets', coalesce((select jsonb_agg(s - 'done') from jsonb_array_elements(e->'sets') s), '[]'::jsonb)) order by i)
      from jsonb_array_elements(w.exercises) with ordinality t(e, i)), '[]'::jsonb)
  where w.user_id = old.user_id and w.day = old.day and w.finished_at is not null;
  return old;
end $$;
revoke all on function public.unlog_resets_workout() from public, anon, authenticated;
drop trigger if exists unlog_resets_workout on public.checkins;
create trigger unlog_resets_workout after delete on public.checkins for each row execute function public.unlog_resets_workout();
