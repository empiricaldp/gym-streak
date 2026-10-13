-- Timers test (024). UNDOES ITSELF (ends with an error on purpose).
do $$
declare a uuid := '00000000-0000-0000-0000-0000000000ab'; b uuid := '00000000-0000-0000-0000-0000000000bb';
  out text := ''; t date := (now() at time zone 'Australia/Sydney')::date; n int; d int;
  gym jsonb := '[{"w":"Push"},{"w":"Pull"},{"w":"Legs"},{"w":"Upper"},{"w":"Lower"},{"w":"Cardio"},{"w":"Arms"}]';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x || '@example.invalid', '', now(), now() from unnest(array[a,b]) x;
  insert into public.profiles (id, name, plate, plan, since, track_start, account, is_public, share_attendance) values
    (a,'Tm A','red',gym,t-30,t-30,'public',true,true),(b,'Tm B','red',gym,t-30,t-30,'public',true,true);
  out := out || E'\n1 rest defaults: 90s, starts on tick: ' || case when (select rest_s = 90 and rest_auto from profiles where id = a) then 'PASS' else 'FAIL' end;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  update public.profiles set rest_s = 120, rest_auto = false where id = a;
  out := out || E'\n2 change own rest settings: ' || case when (select rest_s = 120 and not rest_auto from profiles where id = a) then 'PASS' else 'FAIL' end;
  begin update public.profiles set rest_s = 5000 where id = a; out := out || E'\n3 silly rest refused: FAIL';
  exception when others then out := out || E'\n3 silly rest refused: PASS'; end;
  insert into public.rest_alarms (user_id, due_at, title, body) values (a, now() + interval '90 seconds', 'REST''S UP', 'Next: Bench press, set 2');
  out := out || E'\n4 book a rest alarm: PASS';
  begin insert into public.rest_alarms (user_id, due_at, title, body) values (b, now() + interval '90 seconds', 'x', 'y'); out := out || E'\n5 can''t book for someone else: FAIL';
  exception when others then out := out || E'\n5 can''t book for someone else: PASS'; end;
  begin update public.rest_alarms set due_at = now() + interval '3 hours' where user_id = a; out := out || E'\n6 alarm can''t be hours away: FAIL';
  exception when others then out := out || E'\n6 alarm can''t be hours away: PASS'; end;
  insert into public.workouts (user_id, day, label, exercises) values (a, t, 'Push', '[]');
  update public.workouts set session_ms = 0, session_run_at = now() where user_id = a and day = t;
  out := out || E'\n7 start the session timer: ' || case when (select session_run_at is not null from workouts where user_id = a and day = t) then 'PASS' else 'FAIL' end;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.rest_alarms where user_id = a;
  out := out || E'\n8 others can''t see your alarm: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- the 5-second job: due alarm gets fired once
  update public.rest_alarms set due_at = now() - interval '1 second' where user_id = a;
  n := public.fire_rest_alarms();
  out := out || E'\n9 due alarm fires: ' || case when n = 1 and (select fired_at is not null from rest_alarms where user_id = a) then 'PASS' else 'FAIL (' || n || ')' end;
  n := public.fire_rest_alarms();
  out := out || E'\n10 and only once: ' || case when n = 0 then 'PASS' else 'FAIL' end;

  -- forgot to finish a timer-only session: 50 min banked, then 2h+ quiet → logged with ~50 min
  alter table public.workouts disable trigger workout_stamp;
  update public.workouts set session_ms = 50 * 60000, session_run_at = null, active_at = now() - interval '3 hours' where user_id = a and day = t;
  alter table public.workouts enable trigger workout_stamp;
  perform public.finish_stale_workouts();
  select duration_s into d from workouts where user_id = a and day = t;
  out := out || E'\n11 forgotten timer-only session → logged: ' || case when exists (select 1 from checkins where user_id = a and day = t) then 'PASS' else 'FAIL' end;
  out := out || E'\n12 ...with the time you actually did (50 min): ' || case when d = 3000 then 'PASS' else 'FAIL (' || coalesce(d::text, 'null') || ')' end;
  raise exception 'TESTS:%', out;
end $$;
