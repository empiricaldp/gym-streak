-- Time zone test (015). Pretend users in Sydney and India; UNDOES ITSELF (ends with an error on purpose).
do $$
declare a uuid := '00000000-0000-0000-0000-0000000000a7'; b uuid := '00000000-0000-0000-0000-0000000000b7';
  out text := ''; syd date := (now() at time zone 'Australia/Sydney')::date; ind date := (now() at time zone 'Asia/Kolkata')::date;
  gym jsonb := '[{"w":"Push"},{"w":"Pull"},{"w":"Legs"},{"w":"Upper"},{"w":"Lower"},{"w":"Cardio"},{"w":"Arms"}]';
  ok boolean; nd date;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x || '@example.invalid', '', now(), now() from unnest(array[a,b]) x;
  insert into public.profiles (id, name, plate, plan, since, track_start, account, is_public, share_attendance, notif_remind, remind_at) values
    (a,'Tz Syd','red',gym,syd-30,syd-30,'public',true,true,true,((now() at time zone 'Asia/Kolkata') - interval '5 minutes')::time),
    (b,'Tz Ind','red',gym,ind-30,ind-30,'public',true,true,true,((now() at time zone 'Asia/Kolkata') - interval '5 minutes')::time);
  insert into public.buds (follower, followee) values (a,b),(b,a);
  update public.buds set status = 'accepted' where follower in (a,b);
  insert into public.push_subs (user_id, endpoint, p256dh, auth) values (a,'https://example.invalid/a7','x','x'),(b,'https://example.invalid/b7','x','x');

  out := out || E'\n1 new person defaults to Sydney: ' || case when (select tz from profiles where id = a) = 'Australia/Sydney' then 'PASS' else 'FAIL' end;
  update public.profiles set tz = 'Not/AZone' where id = b;
  out := out || E'\n2 made-up time zone ignored: ' || case when (select tz from profiles where id = b) = 'Australia/Sydney' then 'PASS' else 'FAIL' end;
  update public.profiles set tz = 'Asia/Kolkata' where id = b;
  out := out || E'\n3 India saved: ' || case when (select tz from profiles where id = b) = 'Asia/Kolkata' then 'PASS' else 'FAIL' end;
  out := out || E'\n4 India''s today is India''s date (' || ind || ' vs Sydney ' || syd || '): ' || case when public.local_today(b) = ind then 'PASS' else 'FAIL' end;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  insert into public.checkins (user_id, day) values (b, ind); out := out || E'\n5 India logs their own today: PASS';
  begin insert into public.checkins (user_id, day) values (b, ind + 2); out := out || E'\n6 two days ahead refused: FAIL';
  exception when others then out := out || E'\n6 two days ahead refused: PASS'; end;
  insert into public.nudges (from_user, to_user) values (b, a);
  select day into nd from public.nudges where from_user = b and to_user = a order by id desc limit 1;
  out := out || E'\n7 India''s nudge is stamped with India''s date: ' || case when nd = ind then 'PASS' else 'FAIL (' || nd || ')' end;
  ok := public.freeze_allowed(b, ind - 7);
  out := out || E'\n8 freeze a day in India''s last week: ' || case when ok then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- Reminders: both picked 5 minutes ago INDIA time. Only India is due right now.
  delete from public.checkins where user_id = b;
  out := out || E'\n9 India reminded at India''s time: ' || case when exists (select 1 from public.due_reminders() r where r.uid = b) then 'PASS' else 'FAIL' end;
  out := out || E'\n10 Sydney not reminded at India''s time: ' || case when (select reminded_on from profiles where id = a) is null then 'PASS' else 'FAIL' end;
  out := out || E'\n11 India marked reminded on India''s date: ' || case when (select reminded_on from profiles where id = b) = ind then 'PASS' else 'FAIL' end;
  raise exception 'TESTS:%', out; end $$;
