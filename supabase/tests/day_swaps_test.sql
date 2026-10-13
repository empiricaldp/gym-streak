-- Day swaps test (023). A and B are Buds; C is a stranger and A is private. UNDOES ITSELF (ends with an error on purpose).
do $$
declare a uuid := '00000000-0000-0000-0000-0000000000aa'; b uuid := '00000000-0000-0000-0000-0000000000ba'; c uuid := '00000000-0000-0000-0000-0000000000ca';
  out text := ''; t date := (now() at time zone 'Australia/Sydney')::date; n int;
  gym jsonb := '[{"w":"Push"},{"w":"Pull"},{"w":"Legs"},{"w":"Upper"},{"w":"Lower"},{"w":"Cardio"},{"w":"Arms"}]';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x || '@example.invalid', '', now(), now() from unnest(array[a,b,c]) x;
  insert into public.profiles (id, name, plate, plan, since, track_start, account, is_public, share_attendance) values
    (a,'Sw A','red',gym,t-30,t-30,'private',false,true),(b,'Sw B','red',gym,t-30,t-30,'public',true,true),(c,'Sw C','red',gym,t-30,t-30,'public',true,true);
  insert into public.buds (follower, followee) values (a,b),(b,a);
  update public.buds set status = 'accepted' where follower in (a,b);

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  insert into public.day_swaps (user_id, day, label) values (a, t, 'Push');
  out := out || E'\n1 swap today to Push: PASS';
  update public.day_swaps set label = 'Legs' where user_id = a and day = t;
  out := out || E'\n2 change your mind (Legs): ' || case when (select label from day_swaps where user_id = a and day = t) = 'Legs' then 'PASS' else 'FAIL' end;
  begin insert into public.day_swaps (user_id, day, label) values (a, t - 10, 'Push'); out := out || E'\n3 can''t rewrite old days: FAIL';
  exception when others then out := out || E'\n3 can''t rewrite old days: PASS'; end;
  begin insert into public.day_swaps (user_id, day, label) values (b, t, 'Push'); out := out || E'\n4 can''t swap someone else''s day: FAIL';
  exception when others then out := out || E'\n4 can''t swap someone else''s day: PASS'; end;
  begin insert into public.day_swaps (user_id, day, label) values (a, t + 1, '   '); out := out || E'\n5 blank label refused: FAIL';
  exception when others then out := out || E'\n5 blank label refused: PASS'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.day_swaps where user_id = a;
  out := out || E'\n6 Bud sees the swap: ' || case when n = 1 then 'PASS' else 'FAIL' end;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into n from public.day_swaps where user_id = a;
  out := out || E'\n7 stranger can''t see a private person''s swap: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  delete from public.day_swaps where user_id = a;
  execute 'reset role';
  out := out || E'\n8 stranger can''t undo it: ' || case when exists (select 1 from day_swaps where user_id = a) then 'PASS' else 'FAIL' end;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  delete from public.day_swaps where user_id = a and day = t;
  execute 'reset role';
  out := out || E'\n9 owner can undo: ' || case when not exists (select 1 from day_swaps where user_id = a) then 'PASS' else 'FAIL' end;
  raise exception 'TESTS:%', out;
end $$;
