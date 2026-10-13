-- Workout plans test (022). A and B are Buds. UNDOES ITSELF (ends with an error on purpose).
do $$
declare a uuid := '00000000-0000-0000-0000-0000000000a9'; b uuid := '00000000-0000-0000-0000-0000000000b9';
  out text := ''; t date := (now() at time zone 'Australia/Sydney')::date; n int;
  gym jsonb := '[{"w":"Push"},{"w":"Pull"},{"w":"Legs"},{"w":"Upper"},{"w":"Lower"},{"w":"Cardio"},{"w":"Arms"}]';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x || '@example.invalid', '', now(), now() from unnest(array[a,b]) x;
  insert into public.profiles (id, name, plate, plan, since, track_start, account, is_public, share_attendance) values
    (a,'Pl A','red',gym,t-30,t-30,'public',true,true),(b,'Pl B','red',gym,t-30,t-30,'public',true,true);
  insert into public.buds (follower, followee) values (a,b),(b,a);
  update public.buds set status = 'accepted' where follower in (a,b);
  out := out || E'\n1 unit defaults to kg: ' || case when (select weight_unit from profiles where id = a) = 'kg' then 'PASS' else 'FAIL' end;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  update public.profiles set weight_unit = 'lb' where id = a;
  out := out || E'\n2 can switch own unit to lb: ' || case when (select weight_unit from profiles where id = a) = 'lb' then 'PASS' else 'FAIL' end;
  begin update public.profiles set weight_unit = 'stone' where id = a; out := out || E'\n3 made-up unit refused: FAIL';
  exception when others then out := out || E'\n3 made-up unit refused: PASS'; end;
  insert into public.workout_plans (user_id, label, exercises) values (a, 'Push', '[{"name":"Bench press","sets":[{"reps":8,"kg":60}]}]');
  insert into public.workout_plans (user_id, label, exercises) values (a, ' push ', '[{"name":"Dips","sets":[]}]')
    on conflict (user_id, key) do update set exercises = excluded.exercises;
  select count(*) into n from public.workout_plans where user_id = a;
  out := out || E'\n4 "Push" and " push " are the same plan (saved over, not doubled): ' || case when n = 1 and (select exercises->0->>'name' from workout_plans where user_id = a) = 'Dips' then 'PASS' else 'FAIL' end;
  begin insert into public.workout_plans (user_id, label) values (b, 'Legs'); out := out || E'\n5 can''t write someone else''s plan: FAIL';
  exception when others then out := out || E'\n5 can''t write someone else''s plan: PASS'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.workout_plans where user_id = a;
  out := out || E'\n6 plans are private, even from Buds: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  raise exception 'TESTS:%', out;
end $$;
