-- Tests for migration 005. Ends with a deliberate error that prints results and undoes everything.
do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  c uuid := '00000000-0000-0000-0000-00000000000c';
  t date := (now() at time zone 'Australia/Sydney')::date;
  out text := ''; n int; ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x || '@example.invalid', '', now(), now() from unnest(array[a,b,c]) x;
  insert into public.profiles (id, name, plate, plan, since, track_start, goal, height_cm)
  values (a, 'TestA', 'red',  '[{"w":"Push","opt":false},null,null,null,null,null,null]', t - 30, t - 7, 'bulk', 180),
         (b, 'TestB', 'blue', '[{"w":"Legs","opt":false},null,null,null,null,null,null]', t - 30, t - 7, 'cut', 170),
         (c, 'TestC', 'green','[{"w":"Core","opt":false},null,null,null,null,null,null]', t - 30, t - 7, null, null);
  update public.profiles set share_attendance = false where id = c;   -- C keeps attendance private

  -- act as A
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- bodyweight
  insert into public.bodyweight (user_id, day, kg) values (a, t, 82.4);
  out := out || E'\n1a log own weight: PASS';
  begin insert into public.bodyweight (user_id, day, kg) values (b, t, 70); out := out || E'\n1b cannot log for others: FAIL';
  exception when others then out := out || E'\n1b cannot log for others: PASS'; end;
  begin insert into public.bodyweight (user_id, day, kg) values (a, t - 1, 900); out := out || E'\n1c rejects silly weight: FAIL';
  exception when others then out := out || E'\n1c rejects silly weight: PASS'; end;
  select count(*) into n from public.profiles where id = b;
  out := out || E'\n1d cannot read others goal/height: ' || case when n = 0 then 'PASS' else 'FAIL' end;

  -- reactions
  insert into public.reactions (from_user, to_user, day, emoji) values (a, b, t, 'fire');
  out := out || E'\n2a react to a friend: PASS';
  begin insert into public.reactions (from_user, to_user, day, emoji) values (a, a, t, 'fire'); out := out || E'\n2b cannot react to self: FAIL';
  exception when others then out := out || E'\n2b cannot react to self: PASS'; end;
  begin insert into public.reactions (from_user, to_user, day, emoji) values (a, c, t, 'fire'); out := out || E'\n2c cannot react to private person: FAIL';
  exception when others then out := out || E'\n2c cannot react to private person: PASS'; end;
  begin insert into public.reactions (from_user, to_user, day, emoji) values (b, a, t, 'fire'); out := out || E'\n2d cannot react as someone else: FAIL';
  exception when others then out := out || E'\n2d cannot react as someone else: PASS'; end;
  begin insert into public.reactions (from_user, to_user, day, emoji) values (a, b, t - 30, 'clap'); out := out || E'\n2e cannot react to old days: FAIL';
  exception when others then out := out || E'\n2e cannot react to old days: PASS'; end;

  -- nudges
  insert into public.nudges (from_user, to_user) values (a, b);
  out := out || E'\n3a nudge a friend: PASS';
  begin insert into public.nudges (from_user, to_user) values (a, b); out := out || E'\n3b only one nudge per day: FAIL';
  exception when others then out := out || E'\n3b only one nudge per day: PASS'; end;
  update public.nudges set seen = true where to_user = b;
  get diagnostics n = row_count;
  out := out || E'\n3c sender cannot mark as seen: ' || case when n = 0 then 'PASS' else 'FAIL' end;

  -- freezes
  insert into public.freezes (user_id, day) values (a, t - 1);
  out := out || E'\n4a use a freeze: PASS';
  begin insert into public.freezes (user_id, day) values (a, t - 2);
    -- only a failure if t-1 and t-2 are in the same month
    out := out || E'\n4b one freeze per month: ' || case when date_trunc('month', t - 1) = date_trunc('month', t - 2) then 'FAIL' else 'PASS (month boundary)' end;
  exception when others then out := out || E'\n4b one freeze per month: PASS'; end;
  begin insert into public.freezes (user_id, day) values (a, t - 20); out := out || E'\n4c no freezing old days: FAIL';
  exception when others then out := out || E'\n4c no freezing old days: PASS'; end;
  begin insert into public.freezes (user_id, day) values (b, t - 1); out := out || E'\n4d cannot freeze for others: FAIL';
  exception when others then out := out || E'\n4d cannot freeze for others: PASS'; end;

  -- act as B
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.bodyweight where user_id = a;
  out := out || E'\n5a weight is private: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  select count(*) into n from public.reactions where to_user = b;
  out := out || E'\n5b B sees reaction they got: ' || case when n = 1 then 'PASS' else 'FAIL' end;
  select count(*) into n from public.nudges where to_user = b and not seen;
  out := out || E'\n5c B sees the nudge: ' || case when n = 1 then 'PASS' else 'FAIL' end;
  update public.nudges set seen = true where to_user = b;
  get diagnostics n = row_count;
  out := out || E'\n5d B can dismiss it: ' || case when n = 1 then 'PASS' else 'FAIL' end;
  select count(*) into n from public.freezes where user_id = a;
  out := out || E'\n5e crew sees A''s freeze: ' || case when n = 1 then 'PASS' else 'FAIL' end;

  -- act as C (not involved)
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.nudges;
  out := out || E'\n6 nudges are only between the two people: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  raise exception 'TEST RESULTS:%', out;
end $$;
