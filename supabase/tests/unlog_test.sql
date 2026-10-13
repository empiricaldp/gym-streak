-- Unlog test (026). Run AFTER 026 is applied. UNDOES ITSELF (ends with an error on purpose).
do $$
declare a uuid := '00000000-0000-0000-0000-0000000000ac'; out text := ''; t date := (now() at time zone 'Australia/Sydney')::date; w record;
  gym jsonb := '[{"w":"Push"},{"w":"Pull"},{"w":"Legs"},{"w":"Upper"},{"w":"Lower"},{"w":"Cardio"},{"w":"Arms"}]';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', a || '@example.invalid', '', now(), now());
  insert into public.profiles (id, name, plate, plan, since, track_start, account, is_public, share_attendance) values (a,'Ul A','red',gym,t-30,t-30,'public',true,true);
  insert into public.workouts (user_id, day, label, exercises, session_ms, finished_at, duration_s)
    values (a, t, 'Push', '[{"name":"Bench","done":true,"sets":[{"reps":8,"kg":60,"done":true},{"reps":8,"kg":60,"done":true}]}]', 3000000, now(), 3000);
  insert into public.workouts (user_id, day, label, exercises, session_ms, finished_at, duration_s)
    values (a, t - 2, 'Legs', '[{"name":"Squat","done":true,"sets":[{"reps":5,"kg":100,"done":true}]}]', 4000000, now() - interval '2 days', 4000);
  insert into public.checkins (user_id, day) values (a, t), (a, t - 2);
  delete from public.checkins where user_id = a and day = t;           -- unlog (e.g. from the main app)
  select * into w from public.workouts where user_id = a and day = t;
  out := out || E'\n1 unlog → workout no longer finished: ' || case when w.finished_at is null then 'PASS' else 'FAIL' end;
  out := out || E'\n2 timer back to 0 and length cleared: ' || case when w.session_ms = 0 and w.duration_s is null then 'PASS' else 'FAIL' end;
  out := out || E'\n3 ticks cleared: ' || case when not exists (select 1 from jsonb_array_elements(w.exercises) e where (e->>'done') = 'true')
       and not exists (select 1 from jsonb_array_elements(w.exercises) e, jsonb_array_elements(e->'sets') s where s ? 'done') then 'PASS' else 'FAIL' end;
  out := out || E'\n4 exercises and numbers kept: ' || case when w.exercises->0->>'name' = 'Bench' and (w.exercises->0->'sets'->1->>'kg')::numeric = 60 then 'PASS' else 'FAIL' end;
  out := out || E'\n5 a backup copy was saved first: ' || case when (select count(*) from workout_reset_backups where user_id = a and day = t) = 1
       and (select (workout->'exercises'->0->>'done')::boolean from workout_reset_backups where user_id = a and day = t) then 'PASS' else 'FAIL' end;
  -- restore it exactly like the instructions in 026 say
  update public.workouts wk set exercises = b.workout->'exercises', finished_at = (b.workout->>'finished_at')::timestamptz,
    duration_s = (b.workout->>'duration_s')::int, session_ms = (b.workout->>'session_ms')::bigint, session_run_at = (b.workout->>'session_run_at')::timestamptz
  from (select * from public.workout_reset_backups where user_id = a and day = t order by reset_at desc limit 1) b where wk.user_id = b.user_id and wk.day = b.day;
  select * into w from public.workouts where user_id = a and day = t;
  out := out || E'\n6 restore brings back ticks, timer and length: ' || case when (w.exercises->0->>'done')::boolean and w.session_ms = 3000000 and w.duration_s = 3000 and w.finished_at is not null then 'PASS' else 'FAIL' end;
  insert into public.checkins (user_id, day) values (a, t - 1);
  delete from public.checkins where user_id = a and day = t - 1;       -- a day with no workout: nothing happens
  out := out || E'\n7 unlog a day with no workout: no error, no backup: ' || case when not exists (select 1 from workout_reset_backups where user_id = a and day = t - 1) then 'PASS' else 'FAIL' end;
  select * into w from public.workouts where user_id = a and day = t - 2;
  out := out || E'\n8 other days'' workouts untouched (still finished, ticks, 100 kg): ' || case when w.finished_at is not null and w.duration_s = 4000
       and (w.exercises->0->>'done')::boolean and (w.exercises->0->'sets'->0->>'kg')::numeric = 100 and exists (select 1 from checkins where user_id = a and day = t - 2) then 'PASS' else 'FAIL' end;
  raise exception 'TESTS:%', out;
end $$;
