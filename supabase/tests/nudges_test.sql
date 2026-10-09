-- Nudge rules test (012). Pretend users; UNDOES ITSELF (ends with an error on purpose).
do $$
declare a uuid := '00000000-0000-0000-0000-0000000000a5'; b uuid := '00000000-0000-0000-0000-0000000000b5';
        c uuid := '00000000-0000-0000-0000-0000000000c5'; d uuid := '00000000-0000-0000-0000-0000000000d5';
  out text := ''; td date := (now() at time zone 'Australia/Sydney')::date; pl jsonb := '[null,null,null,null,null,null,null]';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x || '@example.invalid', '', now(), now() from unnest(array[a,b,c,d]) x;
  insert into public.profiles (id, name, plate, plan, since, track_start, account, is_public, share_attendance) values
    (a,'Nz A','red',pl,td,td,'public',true,true),(b,'Nz B','red',pl,td,td,'private',false,false),
    (c,'Nz C','red',pl,td,td,'private',false,false),(d,'Nz D','red',pl,td,td,'public',true,true);
  insert into public.buds (follower, followee) values (a,b),(b,a),(a,c);
  update public.buds set status = 'accepted' where follower in (a,b,c,d);   -- A & B are Buds; A only spots C
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  insert into public.nudges (from_user, to_user) values (a, b); out := out || E'\n1 nudge a Bud: PASS';
  begin insert into public.nudges (from_user, to_user) values (a, b); out := out || E'\n2 again within 10 min blocked: FAIL';
  exception when others then out := out || E'\n2 again within 10 min blocked: PASS'; end;
  execute 'reset role';
  update public.nudges set created_at = now() - interval '11 minutes' where from_user = a and to_user = b;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  insert into public.nudges (from_user, to_user) values (a, b); out := out || E'\n3 after 10 min, Bud can nudge again: PASS';
  begin insert into public.nudges (from_user, to_user) values (a, c); out := out || E'\n4 spotting only (one-way) can''t nudge: FAIL';
  exception when others then out := out || E'\n4 spotting only (one-way) can''t nudge: PASS'; end;
  insert into public.nudges (from_user, to_user) values (a, d); out := out || E'\n5 live-app rule (until launch): first nudge PASS';
  begin insert into public.nudges (from_user, to_user) values (a, d); out := out || E'\n6 live-app rule: second same day blocked: FAIL';
  exception when others then out := out || E'\n6 live-app rule: second same day blocked: PASS'; end;
  execute 'reset role';
  raise exception 'TESTS:%', out; end $$;
