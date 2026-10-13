-- Meals / calories test (029). UNDOES ITSELF (ends with an error on purpose).
do $$
declare a uuid := '00000000-0000-0000-0000-0000000000ac'; b uuid := '00000000-0000-0000-0000-0000000000bc';
  out text := ''; t date; n int; k numeric; r record;
  gym jsonb := '[{"w":"Push"},{"w":"Pull"},{"w":"Legs"},{"w":"Upper"},{"w":"Lower"},{"w":"Cardio"},{"w":"Arms"}]';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x || '@example.invalid', '', now(), now() from unnest(array[a,b]) x;
  insert into public.profiles (id, name, plate, plan, since, track_start, account, is_public, share_attendance) values
    (a,'Ml A','red',gym,current_date-30,current_date-30,'public',true,true),(b,'Ml B','red',gym,current_date-30,current_date-30,'public',true,true);
  t := public.local_today(a);
  out := out || E'\n1 defaults: kcal, summary off, 10pm, no goal: ' || case when (select energy_unit='kcal' and not cal_notify and cal_notify_at='22:00' and cal_goal is null from profiles where id=a) then 'PASS' else 'FAIL' end;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  insert into public.meals (day, kind, name, amount, unit) values (t,'breakfast',null,450,'kcal'),(t,'lunch','Chicken wrap',2300,'kj');
  select sum(kcal) into k from public.meals where day = t;
  out := out || E'\n2 kcal + kJ add up (450 + 2300kJ = 999.7): ' || case when k = 999.7 then 'PASS' else 'FAIL '||k end;
  update public.profiles set cal_goal = 2500, energy_unit = 'kj', cal_notify = true, cal_notify_at = '21:30' where id = a;
  out := out || E'\n3 set own goal/unit/summary: ' || case when (select cal_goal=2500 and energy_unit='kj' and cal_notify from profiles where id=a) then 'PASS' else 'FAIL' end;
  begin update public.profiles set cal_goal = 50 where id = a; out := out || E'\n4 silly goal refused: FAIL';
  exception when others then out := out || E'\n4 silly goal refused: PASS'; end;
  begin insert into public.meals (day, kind, amount, unit) values (t,'snack',0,'kcal'); out := out || E'\n5 zero refused: FAIL';
  exception when others then out := out || E'\n5 zero refused: PASS'; end;
  begin insert into public.meals (day, kind, amount, unit) values (t,'snack',20000,'kcal'); out := out || E'\n6 20,000 kcal meal refused: FAIL';
  exception when others then out := out || E'\n6 20,000 kcal meal refused: PASS'; end;
  begin insert into public.meals (day, kind, amount, unit) values (t,'brunch',100,'kcal'); out := out || E'\n7 unknown meal type refused: FAIL';
  exception when others then out := out || E'\n7 unknown meal type refused: PASS'; end;
  begin insert into public.meals (day, kind, amount, unit) values (t+30,'snack',100,'kcal'); out := out || E'\n8 far-future day refused: FAIL';
  exception when others then out := out || E'\n8 far-future day refused: PASS'; end;
  begin insert into public.meals (user_id, day, kind, amount, unit) values (b,t,'snack',100,'kcal'); out := out || E'\n9 can''t log for someone else: FAIL';
  exception when others then out := out || E'\n9 can''t log for someone else: PASS'; end;
  update public.meals set amount = 500 where kind = 'breakfast';
  out := out || E'\n10 edit own meal: ' || case when (select kcal from meals where kind='breakfast' and user_id=a) = 500 then 'PASS' else 'FAIL' end;
  begin update public.meals set kcal = 1 where kind = 'breakfast'; out := out || E'\n11 can''t fake the kcal column: FAIL';
  exception when others then out := out || E'\n11 can''t fake the kcal column: PASS'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.meals;
  out := out || E'\n12 others can''t see your meals: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  update public.meals set amount = 1 where user_id = a; get diagnostics n = row_count;
  out := out || E'\n13 others can''t edit your meals: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  delete from public.meals where user_id = a; get diagnostics n = row_count;
  out := out || E'\n14 others can''t delete your meals: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  select count(*) into n from public.profiles where id = a and cal_goal is not null;
  out := out || E'\n15 others can''t read your goal: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  begin perform public.due_cal_summaries(); out := out || E'\n16 members can''t call the summary job: FAIL';
  exception when others then out := out || E'\n16 members can''t call the summary job: PASS'; end;
  execute 'reset role';

  -- summary: due when your local time has just passed your chosen time
  insert into public.push_subs (user_id, endpoint, p256dh, auth) values (a, 'https://example.invalid/a', 'x', 'y');
  update public.profiles set cal_notify_at = ((now() at time zone tz) - interval '2 minutes')::time, cal_notified_on = null where id = a;
  select * into r from public.due_cal_summaries() where uid = a;
  out := out || E'\n17 summary due, right total + unit: ' || case when r.uid = a and r.total_kcal = 1049.7 and r.meals = 2 and r.unit = 'kj' and r.goal = 2500 then 'PASS' else 'FAIL '||coalesce(r.total_kcal::text,'none') end;
  select count(*) into n from public.due_cal_summaries() where uid = a;
  out := out || E'\n18 only once a day: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  update public.profiles set cal_notified_on = null, cal_notify = false where id = a;
  select count(*) into n from public.due_cal_summaries() where uid = a;
  out := out || E'\n19 switched off = no summary: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  update public.profiles set cal_notify = true, cal_notified_on = null where id = b;
  update public.profiles set cal_notify_at = ((now() at time zone tz) - interval '2 minutes')::time where id = b;
  insert into public.push_subs (user_id, endpoint, p256dh, auth) values (b, 'https://example.invalid/b', 'x', 'y');
  select count(*) into n from public.due_cal_summaries() where uid = b;
  out := out || E'\n20 no meals today = no summary: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  update public.profiles set cal_notified_on = null, cal_notify_at = ((now() at time zone tz) + interval '20 minutes')::time, cal_notify = true where id = a;
  select count(*) into n from public.due_cal_summaries() where uid = a;
  out := out || E'\n21 not before your time: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  delete from public.profiles where id = a;
  select count(*) into n from public.meals where user_id = a;
  out := out || E'\n22 deleting an account removes its meals: ' || case when n = 0 then 'PASS' else 'FAIL' end;

  raise exception E'TEST RESULTS (rolled back):%', out;
end $$;
