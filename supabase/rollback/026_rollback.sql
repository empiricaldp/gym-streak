-- ROLLBACK for 026 (switch the "undo resets the workout" behaviour off). Before 026 there was no trigger here.
drop trigger if exists unlog_resets_workout on public.checkins;
drop function if exists public.unlog_resets_workout();
-- keep public.workout_reset_backups until nothing needs restoring (restore steps are in 026_unlog_resets_workout.sql)
