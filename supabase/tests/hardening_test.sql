-- Hardening test (017). Pretend users; UNDOES ITSELF (ends with an error on purpose).
do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a9'; b uuid := '00000000-0000-0000-0000-0000000000b9';
  c uuid := '00000000-0000-0000-0000-0000000000c9'; d uuid := '00000000-0000-0000-0000-0000000000d9';
  out text := ''; cid uuid; n int; ts timestamptz; acc text; pub boolean; i int;
  td date := (now() at time zone 'Australia/Sydney')::date;
  pplan jsonb := '[{"w":"Push","opt":false},null,null,null,null,null,null]';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x || '@example.invalid', '', now(), now() from unnest(array[a,b,c,d]) x;
  insert into public.profiles (id, name, plate, plan, since, track_start, account, is_public, share_attendance) values
    (a,'Hd A','red',pplan,td,td,'public',true,true), (b,'Hd B','red',pplan,td,td,'private',false,false),
    (c,'Hd C','red',pplan,td,td,'private',false,false), (d,'Hd D','red',pplan,td,td,'public',true,true);
  insert into public.buds (follower, followee) values (a,c),(c,a);                  -- A & C are Buds (C private)
  update public.buds set status = 'accepted' where follower in (a,c);

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  cid := public.create_circle('Hard', '', array[b, c, d]);
  select count(*) into n from public.circle_members where circle_id = cid;
  execute 'reset role';
  out := out || E'\n1 private stranger B NOT added, Bud C + public D added: ' || case when n = 3 and not exists (select 1 from circle_members where circle_id = cid and user_id = b) then 'PASS' else 'FAIL ' || n end;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  insert into public.nudges (from_user, to_user, created_at) values (a, c, '2000-01-01');
  execute 'reset role';
  select created_at into ts from public.nudges where from_user = a and to_user = c order by id desc limit 1;
  out := out || E'\n2 back-dated nudge gets the real time: ' || case when ts > now() - interval '1 minute' then 'PASS' else 'FAIL' end;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  update public.nudges set seen = true where to_user = c; out := out || E'\n3 receiver can mark seen: PASS';
  begin update public.nudges set from_user = d where to_user = c; out := out || E'\n4 receiver can''t rewrite the sender: FAIL';
  exception when others then out := out || E'\n4 receiver can''t rewrite the sender: PASS'; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  insert into public.checkins (user_id, day) values (a, public.local_today(a) - 10); out := out || E'\n5 tick 10 days ago: PASS';
  begin insert into public.checkins (user_id, day) values (a, public.local_today(a) - 40); out := out || E'\n6 tick 40 days ago refused: FAIL';
  exception when others then out := out || E'\n6 tick 40 days ago refused: PASS'; end;
  insert into public.messages (from_user, circle_id, body, created_at) values (a, cid, 'hi', '2030-01-01');
  select created_at into ts from public.messages where from_user = a order by id desc limit 1;
  out := out || E'\n7 future-dated message gets the real time: ' || case when ts < now() + interval '1 minute' then 'PASS' else 'FAIL' end;
  begin
    for i in 1..30 loop insert into public.messages (from_user, circle_id, body) values (a, cid, 'spam ' || i); end loop;
    out := out || E'\n8 31 messages in a minute blocked: FAIL';
  exception when others then out := out || E'\n8 31 messages in a minute blocked: PASS'; end;
  execute 'reset role';

  -- privacy sync: live app flips its old switch on a "public" account → becomes private
  update public.profiles set is_public = false where id = d;
  select account into acc from public.profiles where id = d;
  out := out || E'\n9 live-app privacy switch carries over: ' || case when acc = 'private' then 'PASS' else 'FAIL ' || coalesce(acc,'null') end;
  update public.profiles set account = 'public' where id = b;
  select is_public and share_attendance into pub from public.profiles where id = b;
  out := out || E'\n10 beta privacy choice carries over to old switches: ' || case when pub then 'PASS' else 'FAIL' end;
  insert into public.freezes (user_id, day) values (a, td - 1);
  begin insert into public.freezes (user_id, day) values (a, date_trunc('month', td)::date); 
        out := out || case when extract(day from td) = 1 then E'\n11 (skipped: 1st of month)' else E'\n11 second freeze same month blocked: FAIL' end;
  exception when others then out := out || E'\n11 second freeze same month blocked: PASS'; end;
  raise exception 'TESTS:%', out; end $$;
