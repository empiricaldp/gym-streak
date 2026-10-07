-- Steps test. Ends with a deliberate error that prints results and undoes everything.
do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  kb uuid; msg text; out text := ''; n int; v int; newk uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-a@example.invalid', '', now(), now()),
         (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-b@example.invalid', '', now(), now());
  insert into public.profiles (id, name, plate, plan, since, track_start)
  values (a, 'TestA', 'red',  '[{"w":"Push","opt":false},null,null,null,null,null,null]', '2026-09-28', '2026-10-05'),
         (b, 'TestB', 'blue', '[{"w":"Legs","opt":false},null,null,null,null,null,null]', '2026-09-28', '2026-10-05');
  select steps_token into kb from public.profiles where id = b;

  -- 1. The Shortcut (signed out, "anon") logs steps for B with B's key
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  select public.log_steps(kb, 8421) into msg;
  out := out || E'\n1 log_steps with key works: ' || case when msg like 'Saved 8421%' then 'PASS (' || msg || ')' else 'FAIL ' || msg end;
  select public.log_steps(kb, 9100) into msg;  -- same day again = update, not duplicate
  begin select public.log_steps(kb, -5) into msg; out := out || E'\n2 rejects bad count: FAIL';
  exception when others then out := out || E'\n2 rejects bad count: PASS'; end;
  begin select public.log_steps(kb, 100, '2020-01-01') into msg; out := out || E'\n3 rejects old date: FAIL';
  exception when others then out := out || E'\n3 rejects old date: PASS'; end;
  begin select count(*) into n from public.steps; out := out || E'\n4 signed-out cannot read steps: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  exception when others then out := out || E'\n4 signed-out cannot read steps: PASS (no access)'; end;
  execute 'reset role';
  select count(*), max(count) into n, v from public.steps where user_id = b;
  out := out || E'\n5 one row per day, latest value kept: ' || case when n = 1 and v = 9100 then 'PASS' else 'FAIL ' || n || '/' || v end;

  -- 6. A (signed in) cannot see B's steps while B keeps them private (the default)
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.steps where user_id = b;
  out := out || E'\n6 steps private by default: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  -- 7. A cannot write steps directly
  begin insert into public.steps (user_id, day, count) values (b, current_date, 1); out := out || E'\n7 no direct writes: FAIL';
  exception when others then out := out || E'\n7 no direct writes: PASS'; end;
  -- 8. A cannot read B's key
  select count(*) into n from public.profiles where id = b;
  out := out || E'\n8 keys are secret: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- 9. B shares steps -> A can see them
  update public.profiles set share_steps = true where id = b;
  execute 'set local role authenticated';
  select count(*) into n from public.steps where user_id = b;
  out := out || E'\n9 shared steps visible: ' || case when n = 1 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- 10. Resetting a key kills the old one
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.reset_steps_key() into newk;
  execute 'reset role';
  begin select public.log_steps(kb, 50) into msg; out := out || E'\n10 old key dead after reset: FAIL';
  exception when others then out := out || E'\n10 old key dead after reset: PASS'; end;

  raise exception 'TEST RESULTS:%', out;
end $$;
