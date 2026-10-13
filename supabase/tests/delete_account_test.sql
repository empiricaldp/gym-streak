-- Delete-account test (028). A deletes themselves. B and C stay. UNDOES ITSELF (ends with an error on purpose).
do $$
declare a uuid := '00000000-0000-0000-0000-0000000000ae'; b uuid := '00000000-0000-0000-0000-0000000000be'; c uuid := '00000000-0000-0000-0000-0000000000ce';
  out text := ''; t date := (now() at time zone 'Australia/Sydney')::date; n int; c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid();
  gym jsonb := '[{"w":"Push"},{"w":"Pull"},{"w":"Legs"},{"w":"Upper"},{"w":"Lower"},{"w":"Cardio"},{"w":"Arms"}]';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x || '@example.invalid', '', now(), now() from unnest(array[a,b,c]) x;
  insert into public.profiles (id, name, plate, plan, since, track_start, account, is_public, share_attendance) values
    (a,'Del A','red',gym,t-30,t-30,'public',true,true),(b,'Del B','red',gym,t-30,t-30,'public',true,true),(c,'Del C','red',gym,t-30,t-30,'public',true,true);
  insert into public.buds (follower, followee) values (a,b),(b,a),(c,b);
  insert into public.checkins (user_id, day) values (a, t), (b, t);
  insert into public.workouts (user_id, day, label, exercises) values (a, t, 'Push', '[]');
  insert into public.messages (from_user, to_user, body) values (a, b, 'hi'), (b, a, 'yo');
  insert into public.circles (id, name, created_by) values (c1, 'A admin, B member', a), (c2, 'Only A', a);
  insert into public.circle_members (circle_id, user_id, role, joined_at) values (c1, a, 'admin', now() - interval '2 days'), (c1, b, 'member', now() - interval '1 day'), (c2, a, 'admin', now());
  insert into public.push_log (kind, to_user, ref, day) values ('checkin', a, 'x', t);

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  begin perform public.delete_my_account('delete'); out := out || E'\n1 wrong word refused: FAIL';
  exception when others then out := out || E'\n1 wrong word refused: PASS'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform public.delete_my_account('DELETE');   -- B deletes B (proves it only ever deletes the caller) — undo below by checking A untouched
  execute 'reset role';
  out := out || E'\n2 deletes only the signed-in person: ' || case when exists (select 1 from profiles where id = a) and not exists (select 1 from profiles where id = b) then 'PASS' else 'FAIL' end;
  out := out || E'\n3 after B left, A is still admin of circle 1: ' || case when exists (select 1 from circle_members where circle_id = c1 and user_id = a and role = 'admin') then 'PASS' else 'FAIL' end;

  -- put B back and redo the scenario with A deleting themselves
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', b || '@example.invalid', '', now(), now());
  insert into public.profiles (id, name, plate, plan, since, track_start, account, is_public, share_attendance) values (b,'Del B','red',gym,t-30,t-30,'public',true,true);
  insert into public.buds (follower, followee) values (a,b),(b,a),(c,b);
  insert into public.checkins (user_id, day) values (b, t);
  insert into public.messages (from_user, to_user, body) values (a, b, 'hi'), (b, a, 'yo'), (b, c, 'to C');
  insert into public.circle_members (circle_id, user_id, role, joined_at) values (c1, b, 'member', now() - interval '1 day');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  perform public.delete_my_account('DELETE');
  execute 'reset role';
  out := out || E'\n4 sign-in removed: ' || case when not exists (select 1 from auth.users where id = a) then 'PASS' else 'FAIL' end;
  select (select count(*) from profiles where id = a) + (select count(*) from checkins where user_id = a) + (select count(*) from workouts where user_id = a)
       + (select count(*) from buds where a in (follower, followee)) + (select count(*) from messages where a in (from_user, to_user))
       + (select count(*) from circle_members where user_id = a) + (select count(*) from push_log where to_user = a) into n;
  out := out || E'\n5 all of A''s data gone (profile, days, workouts, buds, messages, circles, notif log): ' || case when n = 0 then 'PASS' else 'FAIL ' || n end;
  out := out || E'\n6 circle A ran alone is removed: ' || case when not exists (select 1 from circles where id = c2) then 'PASS' else 'FAIL' end;
  out := out || E'\n7 shared circle stays, B becomes admin: ' || case when exists (select 1 from circle_members where circle_id = c1 and user_id = b and role = 'admin') then 'PASS' else 'FAIL' end;
  out := out || E'\n8 B and C untouched (profiles, B''s day, C spots B, B→C message): ' || case when (select count(*) from profiles where id in (b, c)) = 2
       and exists (select 1 from checkins where user_id = b) and exists (select 1 from buds where follower = c and followee = b)
       and exists (select 1 from messages where from_user = b and to_user = c) then 'PASS' else 'FAIL' end;
  begin execute 'set local role anon'; perform public.delete_my_account('DELETE'); out := out || E'\n9 signed-out caller refused: FAIL';
  exception when others then out := out || E'\n9 signed-out caller refused: PASS'; end;
  execute 'reset role';
  raise exception 'TESTS:%', out;
end $$;
