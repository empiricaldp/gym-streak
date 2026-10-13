-- Block + report test (027). A (public) blocks B (public). C is unrelated. UNDOES ITSELF (ends with an error on purpose).
do $$
declare a uuid := '00000000-0000-0000-0000-0000000000ad'; b uuid := '00000000-0000-0000-0000-0000000000bd'; c uuid := '00000000-0000-0000-0000-0000000000cd';
  out text := ''; t date := (now() at time zone 'Australia/Sydney')::date; n int; mid bigint; cid uuid := gen_random_uuid(); r record;
  gym jsonb := '[{"w":"Push"},{"w":"Pull"},{"w":"Legs"},{"w":"Upper"},{"w":"Lower"},{"w":"Cardio"},{"w":"Arms"}]';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x || '@example.invalid', '', now(), now() from unnest(array[a,b,c]) x;
  insert into public.profiles (id, name, plate, plan, since, track_start, account, is_public, share_attendance) values
    (a,'Bl A','red',gym,t-30,t-30,'public',true,true),(b,'Bl B','red',gym,t-30,t-30,'public',true,true),(c,'Bl C','red',gym,t-30,t-30,'public',true,true);
  insert into public.buds (follower, followee) values (a,b),(b,a),(c,a);
  update public.buds set status = 'accepted' where follower in (a,b,c);
  insert into public.checkins (user_id, day) values (a, t), (b, t);
  insert into public.messages (from_user, to_user, body) values (b, a, 'hey');
  select id into mid from public.messages where from_user = b and to_user = a;
  insert into public.circles (id, name, created_by) values (cid, 'Shared', a);
  insert into public.circle_members (circle_id, user_id, role) values (cid, a, 'admin'), (cid, b, 'member');

  -- A blocks B
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  insert into public.blocks (blocker, blocked) values (a, b);
  execute 'reset role';
  select count(*) into n from public.buds where (follower = a and followee = b) or (follower = b and followee = a);
  out := out || E'\n1 blocking removes Buds both ways: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  out := out || E'\n2 C still spots A (only B affected): ' || case when exists (select 1 from buds where follower = c and followee = a) then 'PASS' else 'FAIL' end;

  -- what B can do now
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  select count(*) into n from public.people where id = a;
  out := out || E'\n3 B: A gone from people/search: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  select count(*) into n from public.checkins where user_id = a;
  out := out || E'\n4 B: can''t read A''s gym days (A is PUBLIC): ' || case when n = 0 then 'PASS' else 'FAIL' end;
  begin insert into public.buds (follower, followee) values (b, a); out := out || E'\n5 B: can''t bud A again: FAIL';
  exception when others then out := out || E'\n5 B: can''t bud A again: PASS'; end;
  begin insert into public.messages (from_user, to_user, body) values (b, a, 'hello?'); out := out || E'\n6 B: can''t DM A: FAIL';
  exception when others then out := out || E'\n6 B: can''t DM A: PASS'; end;
  select count(*) into n from public.messages where id = mid;
  out := out || E'\n7 B: old DMs hidden: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  begin insert into public.nudges (from_user, to_user) values (b, a); out := out || E'\n8 B: can''t nudge A: FAIL';
  exception when others then out := out || E'\n8 B: can''t nudge A: PASS'; end;
  begin insert into public.reactions (from_user, to_user, day, emoji) values (b, a, t, 'fire'); out := out || E'\n9 B: can''t react to A: FAIL';
  exception when others then out := out || E'\n9 B: can''t react to A: PASS'; end;
  out := out || E'\n10 B: still sees own profile: ' || case when exists (select 1 from people where id = b) then 'PASS' else 'FAIL' end;
  select count(*) into n from public.blocks;
  out := out || E'\n11 B can''t see A''s block list (not told): ' || case when n = 0 then 'PASS' else 'FAIL' end;

  -- what A sees
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*) into n from public.people where id = b;
  out := out || E'\n12 A: B gone from people too: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  select count(*) into n from public.my_blocks();
  out := out || E'\n13 A: B listed in "Blocked" (to unblock): ' || case when n = 1 then 'PASS' else 'FAIL' end;
  begin insert into public.messages (from_user, to_user, body) values (a, b, 'x'); out := out || E'\n14 A: can''t DM B either: FAIL';
  exception when others then out := out || E'\n14 A: can''t DM B either: PASS'; end;
  begin insert into public.messages (from_user, circle_id, body) values (a, cid, 'circle msg'); out := out || E'\n15 A: can still post in the shared circle: PASS';
  exception when others then out := out || E'\n15 A: can still post in the shared circle: FAIL ' || sqlerrm; end;

  -- shared circle, both directions: A and B each post; C (also in the circle) sees both
  execute 'reset role';
  insert into public.circle_members (circle_id, user_id, role) values (cid, c, 'member');
  insert into public.messages (from_user, circle_id, body) values (b, cid, 'from B in circle');
  execute 'set local role authenticated';
  select count(*) into n from public.messages where circle_id = cid and from_user = b;
  out := out || E'\n15b A (blocker) can''t see B''s circle messages: ' || case when n = 0 then 'PASS' else 'FAIL ' || n end;
  select count(*) into n from public.messages where circle_id = cid and from_user = a;
  out := out || E'\n15c A still sees own circle messages: ' || case when n = 1 then 'PASS' else 'FAIL ' || n end;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.messages where circle_id = cid and from_user = a;
  out := out || E'\n15d B (blocked) can''t see A''s circle messages: ' || case when n = 0 then 'PASS' else 'FAIL ' || n end;
  select count(*) into n from public.messages where circle_id = cid and from_user = b;
  out := out || E'\n15e B still sees own circle messages: ' || case when n = 1 then 'PASS' else 'FAIL ' || n end;
  select count(*) into n from public.people where id = a;
  out := out || E'\n15f B: A off the circle leaderboard (not in people): ' || case when n = 0 then 'PASS' else 'FAIL' end;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into n from public.messages where circle_id = cid;
  out := out || E'\n15g C (not involved) sees both A''s and B''s circle messages: ' || case when n = 2 then 'PASS' else 'FAIL ' || n end;

  -- C is unaffected
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into n from public.people where id in (a, b);
  out := out || E'\n16 C: still sees both A and B: ' || case when n = 2 then 'PASS' else 'FAIL' end;

  -- reports (A reports B's message)
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'reset role'; delete from public.blocks where blocker = a and blocked = b;   -- unblock to let A see the DM again for the report
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  out := out || E'\n17 unblock: B back in A''s list, Buds NOT restored: ' || case when exists (select 1 from people where id = b) and not exists (select 1 from buds where follower = a and followee = b) then 'PASS' else 'FAIL' end;
  insert into public.reports (target_user, message_id, reason, details) values (b, mid, 'harassment', 'test');
  select * into r from public.reports where reporter = a order by id desc limit 1;
  out := out || E'\n18 report saves the real message text (server-copied): ' || case when r.message_body = 'hey' and r.status = 'open' then 'PASS' else 'FAIL' end;
  insert into public.reports (target_user, message_id, reason) values (c, mid, 'spam');   -- that message wasn't from C
  select * into r from public.reports where reporter = a order by id desc limit 1;
  out := out || E'\n19 can''t pin someone else''s message on C: ' || case when r.message_id is null and r.message_body is null then 'PASS' else 'FAIL' end;
  begin insert into public.reports (target_user, reason) values (b, 'nonsense'); out := out || E'\n20 made-up reason refused: FAIL';
  exception when others then out := out || E'\n20 made-up reason refused: PASS'; end;
  for i in 1..8 loop insert into public.reports (target_user, reason) values (b, 'spam'); end loop;   -- 10 today now
  begin insert into public.reports (target_user, reason) values (b, 'spam'); out := out || E'\n21 11th report in a day refused: FAIL';
  exception when others then out := out || E'\n21 11th report in a day refused: PASS'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.reports;
  out := out || E'\n22 B can''t see reports about them: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  begin select count(*) into n from public.open_reports; out := out || E'\n23 app users can''t open the review queue: FAIL';
  exception when others then out := out || E'\n23 app users can''t open the review queue: PASS'; end;
  execute 'reset role';
  raise exception 'TESTS:%', out;
end $$;
