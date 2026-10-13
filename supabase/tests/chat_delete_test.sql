-- Delete chat / delete circle test (030). Pretend users; UNDOES ITSELF (ends with an error on purpose).
do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a9'; b uuid := '00000000-0000-0000-0000-0000000000b9';
  c uuid := '00000000-0000-0000-0000-0000000000c9';
  out text := ''; cid uuid; n int; ts timestamptz;
  td date := (now() at time zone 'Australia/Sydney')::date;
  pplan jsonb := '[{"w":"Push","opt":false},null,null,null,null,null,null]';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x || '@example.invalid', '', now(), now() from unnest(array[a,b,c]) x;
  insert into public.profiles (id, name, plate, plan, since, track_start, account, is_public, share_attendance) values
    (a,'Dl A','red',pplan,td,td,'public',true,true), (b,'Dl B','red',pplan,td,td,'public',true,true), (c,'Dl C','red',pplan,td,td,'public',true,true);
  insert into public.buds (follower, followee) values (a,b),(b,a);
  update public.buds set status = 'accepted' where follower in (a,b);

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  cid := public.create_circle('Del circle', '', array[b, c]);
  insert into public.messages (from_user, to_user, body) values (a, b, 'hi');
  insert into public.messages (from_user, circle_id, body) values (a, cid, 'circle hi');
  -- A deletes the 1-on-1 chat with B (for A only)
  insert into public.chat_reads (user_id, chat, read_at, cleared_at) values (a, 'd:' || b, now(), now())
    on conflict (user_id, chat) do update set cleared_at = excluded.cleared_at;
  out := out || E'\n1 save "deleted up to" on my chat: ' || case when (select cleared_at is not null from chat_reads where user_id = a and chat = 'd:' || b) then 'PASS' else 'FAIL' end;
  begin insert into public.chat_reads (user_id, chat, cleared_at) values (b, 'd:' || a, now()); out := out || E'\n2 can''t clear someone else''s chat: FAIL';
  exception when others then out := out || E'\n2 can''t clear someone else''s chat: PASS'; end;
  -- B still has the message
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.messages where from_user = a and to_user = b;
  out := out || E'\n3 the other person keeps their copy: ' || case when n = 1 then 'PASS' else 'FAIL' end;
  select count(*) into n from public.chat_reads where user_id = a;
  out := out || E'\n4 others can''t see that I deleted it: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  -- B (member, not admin) can't delete the circle
  begin perform public.delete_circle(cid); out := out || E'\n5 a member can''t delete the circle: FAIL';
  exception when others then out := out || E'\n5 a member can''t delete the circle: PASS'; end;
  select count(*) into n from public.circles where id = cid;
  out := out || E'\n6 circle still there: ' || case when n = 1 then 'PASS' else 'FAIL' end;
  -- A (admin) deletes it: gone for everyone, with its chat
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.delete_circle(cid);
  execute 'reset role';
  out := out || E'\n7 admin deletes the circle: ' || case when not exists (select 1 from circles where id = cid) then 'PASS' else 'FAIL' end;
  out := out || E'\n8 its members list goes too: ' || case when not exists (select 1 from circle_members where circle_id = cid) then 'PASS' else 'FAIL' end;
  out := out || E'\n9 its chat goes too: ' || case when not exists (select 1 from messages where circle_id = cid) then 'PASS' else 'FAIL' end;
  out := out || E'\n10 the 1-on-1 chat is untouched: ' || case when exists (select 1 from messages where from_user = a and to_user = b) then 'PASS' else 'FAIL' end;
  begin execute 'set local role anon'; perform public.delete_circle(gen_random_uuid()); execute 'reset role'; out := out || E'\n11 logged-out can''t call it: FAIL';
  exception when others then execute 'reset role'; out := out || E'\n11 logged-out can''t call it: PASS'; end;

  raise exception E'TEST RESULTS (rolled back):%', out;
end $$;
