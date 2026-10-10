-- Chats test (016). Pretend users; UNDOES ITSELF (ends with an error on purpose).
do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a8'; b uuid := '00000000-0000-0000-0000-0000000000b8';
  c uuid := '00000000-0000-0000-0000-0000000000c8'; d uuid := '00000000-0000-0000-0000-0000000000d8';
  out text := ''; cid uuid; n int; mid bigint;
  td date := (now() at time zone 'Australia/Sydney')::date;
  pplan jsonb := '[{"w":"Push","opt":false},null,null,null,null,null,null]';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x || '@example.invalid', '', now(), now() from unnest(array[a,b,c,d]) x;
  insert into public.profiles (id, name, plate, plan, since, track_start, account, is_public, share_attendance) values
    (a,'Ch A','red',pplan,td,td,'public',true,true), (b,'Ch B','red',pplan,td,td,'public',true,true),
    (c,'Ch C','red',pplan,td,td,'public',true,true), (d,'Ch D','red',pplan,td,td,'public',true,true);
  insert into public.buds (follower, followee) values (a,b),(b,a),(a,c);          -- A & B are Buds; A only spots C
  update public.buds set status = 'accepted' where follower in (a,b,c,d);

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  cid := public.create_circle('Chat circle', '', array[d]);                     -- A + D share a circle (not Buds)
  insert into public.messages (from_user, to_user, body) values (a, b, 'you coming tonight?') returning id into mid;
  out := out || E'\n1 Buds can DM: PASS';
  begin insert into public.messages (from_user, to_user, body) values (a, c, 'hi'); out := out || E'\n2 one-way spotting can''t DM: FAIL';
  exception when others then out := out || E'\n2 one-way spotting can''t DM: PASS'; end;
  begin insert into public.messages (from_user, to_user, body) values (a, d, 'hi'); out := out || E'\n3 circle-mate (not Bud) can''t DM: FAIL';
  exception when others then out := out || E'\n3 circle-mate (not Bud) can''t DM: PASS'; end;
  insert into public.messages (from_user, circle_id, body) values (a, cid, 'gym at 6 🔥'); out := out || E'\n4 member can post in circle chat: PASS';
  begin insert into public.messages (from_user, to_user, body) values (a, b, '   '); out := out || E'\n5 empty message refused: FAIL';
  exception when others then out := out || E'\n5 empty message refused: PASS'; end;
  begin insert into public.messages (from_user, to_user, body) values (b, a, 'pretending to be B'); out := out || E'\n6 can''t send as someone else: FAIL';
  exception when others then out := out || E'\n6 can''t send as someone else: PASS'; end;
  insert into public.chat_reads (user_id, chat) values (a, 'd:' || b) on conflict (user_id, chat) do update set read_at = now();
  out := out || E'\n7 save my own read marker: PASS';
  begin insert into public.chat_reads (user_id, chat) values (b, 'd:' || a); out := out || E'\n8 can''t write someone else''s read marker: FAIL';
  exception when others then out := out || E'\n8 can''t write someone else''s read marker: PASS'; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  select count(*) into n from public.messages where (from_user = a and to_user = b);
  out := out || E'\n9 B reads the DM: ' || case when n = 1 then 'PASS' else 'FAIL' end;
  select count(*) into n from public.messages where circle_id = cid;
  out := out || E'\n10 B (not in circle) can''t read the circle chat: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  delete from public.messages where id = mid;
  execute 'reset role';
  out := out || E'\n11 B can''t delete A''s message: ' || case when exists (select 1 from public.messages where id = mid) then 'PASS' else 'FAIL' end;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  select count(*) into n from public.messages where from_user = a;
  out := out || E'\n12 outsider C reads nothing of A''s: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  begin insert into public.messages (from_user, circle_id, body) values (c, cid, 'let me in'); out := out || E'\n13 non-member can''t post in circle: FAIL';
  exception when others then out := out || E'\n13 non-member can''t post in circle: PASS'; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  select count(*) into n from public.messages where circle_id = cid;
  out := out || E'\n14 circle-mate D reads the circle chat: ' || case when n = 1 then 'PASS' else 'FAIL' end;
  perform public.leave_circle(cid);
  begin insert into public.messages (from_user, circle_id, body) values (d, cid, 'bye'); out := out || E'\n15 after leaving, can''t post: FAIL';
  exception when others then out := out || E'\n15 after leaving, can''t post: PASS'; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  delete from public.messages where id = mid;
  execute 'reset role';
  out := out || E'\n16 A deletes own message: ' || case when not exists (select 1 from public.messages where id = mid) then 'PASS' else 'FAIL' end;
  raise exception 'TESTS:%', out; end $$;
