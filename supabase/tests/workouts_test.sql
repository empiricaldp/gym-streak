-- Workouts test (021). Three pretend people: A and B are Buds, C only spots A. UNDOES ITSELF (ends with an error on purpose).
do $$
declare a uuid := '00000000-0000-0000-0000-0000000000a8'; b uuid := '00000000-0000-0000-0000-0000000000b8'; c uuid := '00000000-0000-0000-0000-0000000000c8';
  out text := ''; t date := (now() at time zone 'Australia/Sydney')::date; n int; ok boolean; ts timestamptz;
  gym jsonb := '[{"w":"Push"},{"w":"Pull"},{"w":"Legs"},{"w":"Upper"},{"w":"Lower"},{"w":"Cardio"},{"w":"Arms"}]';
  ex jsonb := '[{"name":"Bench press","done":true,"sets":[{"reps":8,"kg":60}]},{"name":"Dips","done":false,"sets":[]}]';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x || '@example.invalid', '', now(), now() from unnest(array[a,b,c]) x;
  insert into public.profiles (id, name, plate, plan, since, track_start, account, is_public, share_attendance) values
    (a,'Wo A','red',gym,t-30,t-30,'public',true,true),(b,'Wo B','red',gym,t-30,t-30,'public',true,true),(c,'Wo C','red',gym,t-30,t-30,'public',true,true);
  insert into public.buds (follower, followee) values (a,b),(b,a),(c,a);
  update public.buds set status = 'accepted' where follower in (a,b,c);

  -- A logs a workout
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  insert into public.workouts (user_id, day, label, exercises, started_at, active_at) values (a, t, 'Push', ex, now() - interval '9 hours', now() - interval '9 hours');
  select active_at into ts from public.workouts where user_id = a and day = t;
  out := out || E'\n1 A saves own workout, server stamps the time (not the phone''s): ' || case when ts > now() - interval '1 minute' then 'PASS' else 'FAIL' end;
  begin insert into public.workouts (user_id, day) values (b, t); out := out || E'\n2 A can''t write B''s workout: FAIL';
  exception when others then out := out || E'\n2 A can''t write B''s workout: PASS'; end;
  begin insert into public.workouts (user_id, day) values (a, t + 3); out := out || E'\n3 future day refused: FAIL';
  exception when others then out := out || E'\n3 future day refused: PASS'; end;
  begin update public.workouts set exercises = (select jsonb_agg(x) from generate_series(1,31) x) where user_id = a and day = t; out := out || E'\n4 more than 30 exercises refused: FAIL';
  exception when others then out := out || E'\n4 more than 30 exercises refused: PASS'; end;

  -- B (Bud) sees it, C (only spots A) doesn't
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.workouts where user_id = a;
  out := out || E'\n5 Bud sees the details: ' || case when n = 1 then 'PASS' else 'FAIL' end;
  update public.workouts set label = 'hacked' where user_id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into n from public.workouts where user_id = a;
  out := out || E'\n6 one-way spotter can''t see weights: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  execute 'reset role';
  out := out || E'\n7 Bud can''t edit it: ' || case when (select label from public.workouts where user_id = a and day = t) = 'Push' then 'PASS' else 'FAIL' end;

  -- auto-finish: nothing changed for 2+ hours with a ticked exercise → logged + finished; untouched-for-2h with nothing ticked → left alone
  alter table public.workouts disable trigger workout_stamp;
  update public.workouts set active_at = now() - interval '3 hours' where user_id = a and day = t;
  insert into public.workouts (user_id, day, exercises, active_at) values (b, t, '[{"name":"Row","done":false,"sets":[]}]', now() - interval '3 hours');
  insert into public.workouts (user_id, day, exercises, active_at) values (c, t, '[{"name":"Squat","done":true,"sets":[]}]', now() - interval '10 minutes');
  alter table public.workouts enable trigger workout_stamp;
  perform public.finish_stale_workouts();
  out := out || E'\n8 forgot to finish (2h quiet, 1 ticked) → day logged: ' || case when exists (select 1 from checkins where user_id = a and day = t) then 'PASS' else 'FAIL' end;
  out := out || E'\n9 ...and marked finished: ' || case when (select finished_at from workouts where user_id = a and day = t) is not null then 'PASS' else 'FAIL' end;
  out := out || E'\n10 nothing ticked → not logged: ' || case when not exists (select 1 from checkins where user_id = b and day = t) then 'PASS' else 'FAIL' end;
  out := out || E'\n11 still training (10 min ago) → not logged yet: ' || case when not exists (select 1 from checkins where user_id = c and day = t) then 'PASS' else 'FAIL' end;
  -- yesterday's unfinished workout gets finished even if recent-ish
  alter table public.workouts disable trigger workout_stamp;
  insert into public.workouts (user_id, day, exercises, active_at) values (c, t - 1, '[{"name":"Squat","done":true,"sets":[]}]', now() - interval '30 minutes');
  alter table public.workouts enable trigger workout_stamp;
  perform public.finish_stale_workouts();
  out := out || E'\n12 yesterday''s unfinished workout → logged on yesterday: ' || case when exists (select 1 from checkins where user_id = c and day = t - 1) then 'PASS' else 'FAIL' end;
  -- once finished, stays finished (can't be "un-finished" to re-trigger)
  update public.workouts set label = 'Push' where user_id = a and day = t;
  out := out || E'\n13 a normal save keeps it finished: ' || case when (select finished_at from workouts where user_id = a and day = t) is not null then 'PASS' else 'FAIL' end;
  update public.workouts set duration_s = 3000 where user_id = a and day = t;
  update public.workouts set finished_at = null where user_id = a and day = t;
  out := out || E'\n14 undo the log → reopened, length cleared: ' || case when (select finished_at is null and duration_s is null from workouts where user_id = a and day = t) then 'PASS' else 'FAIL' end;
  raise exception 'TESTS:%', out;
end $$;
