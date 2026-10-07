-- Privacy rules test. Paste into Supabase SQL Editor and Run.
-- It creates two fake people, checks what each can see, then ends with a deliberate
-- error that prints the results AND undoes everything (nothing is saved).
-- Expect an error message starting with "TEST RESULTS:" — every line should say PASS.
do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  out text := '';
  ok boolean;
  n int;
  detail text;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-a@example.invalid', '', now(), now()),
         (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-b@example.invalid', '', now(), now());
  insert into public.profiles (id, name, plate, plan, since, track_start, is_public, share_attendance, share_split)
  values (a, 'TestA', 'red',  '[{"w":"Push","opt":false},null,null,null,null,null,null]', '2026-09-28', '2026-10-05', true, true, true),
         (b, 'TestB', 'blue', '[{"w":"Legs","opt":false},{"w":"Abs","opt":true},null,null,null,null,null]', '2026-09-28', '2026-10-05', true, true, false);
  insert into public.checkins (user_id, day) values (b, '2026-10-05');

  -- From here on, act as person A
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- 1. B shares attendance but hides their split
  select (plan->0->>'w') is null and (plan->1->>'opt') = 'true' and plan->2 = 'null'::jsonb, plan::text
    into ok, detail from public.crew where name = 'TestB';
  out := out || E'\n1a split hidden, names blanked: ' || case when ok then 'PASS' else 'FAIL ' || coalesce(detail,'(B missing)') end;
  select count(*) into n from public.checkins where user_id = b;
  out := out || E'\n1b attendance shared, check-in visible: ' || case when n = 1 then 'PASS' else 'FAIL ' || n end;
  select count(*) into n from public.profiles where id = b;
  out := out || E'\n1c raw profiles table hides B: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  select (plan->0->>'w') = 'Push' into ok from public.crew where id = a;
  out := out || E'\n1d A sees own full plan: ' || case when ok then 'PASS' else 'FAIL' end;

  -- 2. B turns attendance off
  execute 'reset role';
  update public.profiles set share_attendance = false where id = b;
  execute 'set local role authenticated';
  select count(*) into n from public.checkins where user_id = b;
  out := out || E'\n2a attendance hidden, check-ins invisible: ' || case when n = 0 then 'PASS' else 'FAIL ' || n end;
  select since is null into ok from public.crew where id = b;
  out := out || E'\n2b attendance hidden, dates blanked: ' || case when ok then 'PASS' else 'FAIL' end;

  -- 3. B goes fully private
  execute 'reset role';
  update public.profiles set is_public = false where id = b;
  execute 'set local role authenticated';
  select count(*) into n from public.crew where id = b;
  out := out || E'\n3 private, B gone from crew: ' || case when n = 0 then 'PASS' else 'FAIL' end;

  -- 4. A cannot tick a day for B
  begin
    insert into public.checkins (user_id, day) values (b, '2026-10-06');
    out := out || E'\n4 cannot tick for someone else: FAIL (allowed)';
  exception when others then
    out := out || E'\n4 cannot tick for someone else: PASS';
  end;

  -- 5. A cannot rename B
  update public.profiles set name = 'Hacked' where id = b;
  get diagnostics n = row_count;
  out := out || E'\n5 cannot edit someone else: ' || case when n = 0 then 'PASS' else 'FAIL' end;

  -- 6. Signed-out visitors get nothing
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin
    select count(*) into n from public.crew;
    out := out || E'\n6 signed-out blocked from crew: ' || case when n = 0 then 'PASS (0 rows)' else 'FAIL ' || n end;
  exception when others then
    out := out || E'\n6 signed-out blocked from crew: PASS (no access)';
  end;
  execute 'reset role';

  raise exception 'TEST RESULTS:%', out;
end $$;
