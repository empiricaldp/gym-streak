-- Buds / profiles test (011). Runs as pretend users and UNDOES ITSELF (ends with an error on purpose).
do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a2'; b uuid := '00000000-0000-0000-0000-0000000000b2';
  c uuid := '00000000-0000-0000-0000-0000000000c2'; d uuid := '00000000-0000-0000-0000-0000000000d2';
  e uuid := '00000000-0000-0000-0000-0000000000e2';
  out text := ''; n int; st text; v boolean; pl jsonb; ok boolean;
  plan jsonb := '[{"w":"Push","opt":false},{"w":"Pull","opt":false},null,null,null,null,null]';
  td date := (now() at time zone 'Australia/Sydney')::date;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x || '@example.invalid', '', now(), now() from unnest(array[a,b,c,d,e]) x;
  insert into public.profiles (id, name, plate, plan, since, track_start, account, is_public, share_attendance, share_split) values
    (a, 'Test A', 'red',  plan, td - 30, td - 7, 'public',  true,  true, true),
    (b, 'Test B', 'blue', plan, td - 30, td - 7, 'private', false, true, true),
    (c, 'Test C', 'red',  plan, td - 30, td - 7, 'public',  true,  true, true),
    (d, 'Test D', 'red',  plan, td - 30, td - 7, 'private', false, true, true),
    (e, 'Test E', 'red',  plan, td - 30, td - 7, null,      true,  true, false);   -- old-style member, hasn't chosen yet
  insert into public.checkins (user_id, day) values (b, td);

  -- as A
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  insert into public.buds (follower, followee, status) values (a, b, 'accepted');          -- tries to skip the approval
  select status into st from public.buds where follower = a and followee = b;
  out := out || E'\n1 bud a private account = request (can''t skip approval): ' || case when st = 'pending' then 'PASS' else 'FAIL ' || st end;
  select count(*) into n from public.checkins where user_id = b;
  out := out || E'\n3 can''t see a private person''s sessions before approval: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  select visible, people.plan into v, pl from public.people where id = b;
  out := out || E'\n4 private profile locked (no split): ' || case when not v and pl is null then 'PASS' else 'FAIL' end;
  insert into public.buds (follower, followee) values (a, d);
  update public.buds set status = 'accepted' where follower = a and followee = d;           -- tries to accept its own request
  select status into st from public.buds where follower = a and followee = d;
  out := out || E'\n6 can''t accept your own request: ' || case when st = 'pending' then 'PASS' else 'FAIL' end;
  select not private and split_hidden into ok from public.people where id = e;
  out := out || E'\n8 old member counts as public with split hidden (from old settings): ' || case when ok then 'PASS' else 'FAIL' end;
  select count(*) into n from public.crew where id = b;
  out := out || E'\n12 old crew view (live app) unchanged, still hides private B: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- as C: bud a public account
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  insert into public.buds (follower, followee) values (c, a);
  select status into st from public.buds where follower = c and followee = a;
  out := out || E'\n2 bud a public account = instant: ' || case when st = 'accepted' then 'PASS' else 'FAIL' end;
  select count(*) into n from public.buds where follower = a and followee = b;
  out := out || E'\n13 can''t see other people''s bud requests: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  begin insert into public.nudges (from_user, to_user) values (c, b); out := out || E'\n11 non-bud can''t nudge a private account: FAIL';
  exception when others then out := out || E'\n11 non-bud can''t nudge a private account: PASS'; end;
  execute 'reset role';

  -- as B: accept A, then hide split
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  perform public.accept_bud(a);
  update public.profiles set hide_split = true where id = b;
  execute 'reset role';

  -- as A again
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  select count(*) into n from public.checkins where user_id = b;
  select visible into v from public.people where id = b;
  out := out || E'\n5 after approval, A sees B''s sessions + profile: ' || case when n = 1 and v then 'PASS' else 'FAIL' end;
  select people.plan into pl from public.people where id = b;
  out := out || E'\n7 "Hide my split" blanks workout names but keeps gym days: ' || case when pl->0->>'w' is null and pl->0 is not null and pl->2 = 'null'::jsonb then 'PASS' else 'FAIL ' || pl::text end;
  insert into public.nudges (from_user, to_user) values (a, b);
  out := out || E'\n10 buds can nudge a private bud: PASS';
  execute 'reset role';

  -- as D: go public → waiting request from A accepted
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  update public.profiles set account = 'public' where id = d;
  execute 'reset role';
  select status into st from public.buds where follower = a and followee = d;
  out := out || E'\n9 going public auto-accepts waiting requests: ' || case when st = 'accepted' then 'PASS' else 'FAIL' end;

  -- as B: remove follower A
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  delete from public.buds where follower = a and followee = b;
  execute 'reset role';
  select count(*) into n from public.buds where follower = a and followee = b;
  out := out || E'\n14 you can remove a follower: ' || case when n = 0 then 'PASS' else 'FAIL' end;

  raise exception 'TESTS:%', out;
end $$;
