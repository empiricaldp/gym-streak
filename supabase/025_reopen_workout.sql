-- 025: Undoing a log reopens the workout (beta).
-- Before: once finished, a workout stayed finished, so "finished by mistake → undo the log" left it stuck.
-- Now: setting finished_at back to empty reopens it (and clears its length). Finishing again can't
-- spam the crew: crew notifications are already once per person per day (push_log).
create or replace function public.workout_stamp() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.started_at := now(); new.active_at := now();
    if new.finished_at is not null then new.finished_at := now(); end if;
  else
    new.started_at := old.started_at;
    if new.exercises is distinct from old.exercises or new.label is distinct from old.label
       or new.session_ms is distinct from old.session_ms or new.session_run_at is distinct from old.session_run_at
      then new.active_at := now(); else new.active_at := old.active_at; end if;
    if old.finished_at is not null and new.finished_at is null then new.duration_s := null; new.active_at := now();   -- reopened
    elsif old.finished_at is not null then new.finished_at := old.finished_at; new.duration_s := coalesce(new.duration_s, old.duration_s);
    elsif new.finished_at is not null then new.finished_at := now(); end if;
  end if;
  return new;
end $$;
