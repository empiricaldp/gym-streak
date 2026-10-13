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
  insert into public.checkins (user_id, day) values (a, t);
  delete from public.checkins where user_id = a and day = t;           -- unlog (e.g. from the main app)
  select * into w from public.workouts where user_id = a and day = t;
  out := out || E'\n1 unlog → workout no longer finished: ' || case when w.finished_at is null then 'PASS' else 'FAIL' end;
  out := out || E'\n2 timer back to 0 and length cleared: ' || case when w.session_ms = 0 and w.duration_s is null then 'PASS' else 'FAIL' end;
  out := out || E'\n3 ticks cleared: ' || case when not exists (select 1 from jsonb_array_elements(w.exercises) e where (e->>'done') = 'true')
       and not exists (select 1 from jsonb_array_elements(w.exercises) e, jsonb_array_elements(e->'sets') s where s ? 'done') then 'PASS' else 'FAIL' end;
  out := out || E'\n4 exercises and numbers kept: ' || case when w.exercises->0->>'name' = 'Bench' and (w.exercises->0->'sets'->1->>'kg')::numeric = 60 then 'PASS' else 'FAIL' end;
  insert into public.checkins (user_id, day) values (a, t - 1);
  delete from public.checkins where user_id = a and day = t - 1;       -- a day with no workout: nothing happens
  out := out || E'\n5 unlog a day with no workout: no error: PASS';
  raise exception 'TESTS:%', out;
end $$;
