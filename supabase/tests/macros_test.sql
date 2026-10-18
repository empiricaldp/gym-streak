-- Macros test (032). UNDOES ITSELF (ends with an error on purpose).
do $$
declare a uuid := '00000000-0000-0000-0000-0000000000ad'; b uuid := '00000000-0000-0000-0000-0000000000bd';
  out text := ''; t date; n int; k numeric; r record;
  gym jsonb := '[{"w":"Push"},{"w":"Pull"},{"w":"Legs"},{"w":"Upper"},{"w":"Lower"},{"w":"Cardio"},{"w":"Arms"}]';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x || '@example.invalid', '', now(), now() from unnest(array[a,b]) x;
  insert into public.profiles (id, name, plate, plan, since, track_start, account, is_public, share_attendance) values
    (a,'Mc A','red',gym,current_date-30,current_date-30,'public',true,true),(b,'Mc B','red',gym,current_date-30,current_date-30,'public',true,true);
  t := public.local_today(a);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  insert into public.meals (day, kind, protein_g) values (t, 'snack', 30);
  out := out || E'\n1 only protein is enough to log a meal: PASS';
  select kcal into k from public.meals where kind = 'snack';
  out := out || E'\n2 only protein → no calories counted: ' || case when k is null then 'PASS' else 'FAIL '||k end;
  insert into public.meals (day, kind, protein_g, carbs_g, fat_g) values (t, 'lunch', 30, 50, 10);
  select kcal into k from public.meals where kind = 'lunch';
  out := out || E'\n3 all three macros → calories worked out (30·4+50·4+10·9 = 410): ' || case when k = 410 then 'PASS' else 'FAIL '||k end;
  insert into public.meals (day, kind, amount, unit, protein_g) values (t, 'dinner', 2300, 'kj', 40);
  select kcal into k from public.meals where kind = 'dinner';
  out := out || E'\n4 typed energy wins (2300 kJ = 549.7 kcal): ' || case when k = 549.7 then 'PASS' else 'FAIL '||k end;
  begin insert into public.meals (day, kind) values (t, 'breakfast'); out := out || E'\n5 empty meal refused: FAIL';
  exception when others then out := out || E'\n5 empty meal refused: PASS'; end;
  begin insert into public.meals (day, kind, protein_g) values (t, 'breakfast', 5000); out := out || E'\n6 5,000 g protein refused: FAIL';
  exception when others then out := out || E'\n6 5,000 g protein refused: PASS'; end;
  begin insert into public.meals (day, kind, amount) values (t, 'breakfast', 300); out := out || E'\n7 energy without kcal/kJ refused: FAIL';
  exception when others then out := out || E'\n7 energy without kcal/kJ refused: PASS'; end;
  update public.profiles set protein_goal = 150, carbs_goal = 250, fat_goal = 70 where id = a;
  out := out || E'\n8 set own macro goals: ' || case when (select protein_goal = 150 and fat_goal = 70 from profiles where id = a) then 'PASS' else 'FAIL' end;
  begin update public.profiles set protein_goal = 0 where id = a; out := out || E'\n9 silly goal refused: FAIL';
  exception when others then out := out || E'\n9 silly goal refused: PASS'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.meals where protein_g is not null;
  out := out || E'\n10 others can''t see your macros: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  select count(*) into n from public.profiles where id = a and protein_goal is not null;
  out := out || E'\n11 others can''t see your goals: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  execute 'reset role';
  insert into public.push_subs (user_id, endpoint, p256dh, auth) values (a, 'https://example.invalid/a', 'x', 'y');
  update public.profiles set cal_notify = true, cal_notify_at = ((now() at time zone tz) - interval '2 minutes')::time, cal_notified_on = null where id = a;
  select * into r from public.due_cal_summaries() where uid = a;
  out := out || E'\n12 nightly total = known calories (410 + 549.7), counts all 3 meals: ' || case when r.total_kcal = 959.7 and r.meals = 3 then 'PASS' else 'FAIL '||coalesce(r.total_kcal::text,'none')||'/'||coalesce(r.meals::text,'-') end;
  raise exception E'TEST RESULTS (rolled back):%', out;
end $$;
