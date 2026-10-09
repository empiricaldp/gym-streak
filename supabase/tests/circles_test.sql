-- Circles test (013). Pretend users; UNDOES ITSELF (ends with an error on purpose).
do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a6'; b uuid := '00000000-0000-0000-0000-0000000000b6';
  c uuid := '00000000-0000-0000-0000-0000000000c6'; d uuid := '00000000-0000-0000-0000-0000000000d6';
  e uuid := '00000000-0000-0000-0000-0000000000e6';
  out text := ''; cid uuid; code text; n int; ok boolean; pl jsonb; r record;
  td date := (now() at time zone 'Australia/Sydney')::date;
  pplan jsonb := '[{"w":"Push","opt":false},null,null,null,null,null,null]';
  procedure_as text;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x || '@example.invalid', '', now(), now() from unnest(array[a,b,c,d,e]) x;
  insert into public.profiles (id, name, plate, plan, since, track_start, account, hide_split, is_public, share_attendance) values
    (a,'Ci A','red',pplan,td-9,td-9,'public',false,true,true),
    (b,'Ci B','red',pplan,td-9,td-9,'private',false,false,false),       -- private, split shown
    (c,'Ci C','red',pplan,td-9,td-9,'private',true,false,false),        -- private, split hidden
    (d,'Ci D','red',pplan,td-9,td-9,'public',false,true,true),
    (e,'Ci E','red',pplan,td-9,td-9,'private',false,false,false);       -- outsider
  insert into public.checkins (user_id, day) values (b, td), (e, td);

  -- A creates a circle with B and C (straight in)
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  cid := public.create_circle('Test circle', '🔥', array[b, c]);
  select count(*) into n from public.circle_members where circle_id = cid;
  select role = 'admin' into ok from public.circle_members where circle_id = cid and user_id = a;
  out := out || E'\n1 create: everyone added straight in, creator is admin: ' || case when n = 3 and ok then 'PASS' else 'FAIL' end;
  select count(*) into n from public.checkins where user_id = b;
  out := out || E'\n2 circle-mate sees a private member''s sessions: ' || case when n = 1 then 'PASS' else 'FAIL' end;
  select people.plan into pl from public.people where id = b;
  out := out || E'\n3 ...and their split: ' || case when pl->0->>'w' = 'Push' then 'PASS' else 'FAIL' end;
  select people.plan into pl from public.people where id = c;
  out := out || E'\n4 "Hide my split" still hidden from the circle: ' || case when pl->0->>'w' is null and pl->0 is not null then 'PASS' else 'FAIL' end;
  select count(*) into n from public.checkins where user_id = e;
  out := out || E'\n5 outsider (private, not in circle) stays hidden: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  insert into public.nudges (from_user, to_user) values (a, b);
  out := out || E'\n6 circle-mate can nudge: PASS';
  begin insert into public.nudges (from_user, to_user) values (a, b); out := out || E'\n7 second circle nudge same day blocked: FAIL';
  exception when others then out := out || E'\n7 second circle nudge same day blocked: PASS'; end;
  select invite_code into code from public.circles where id = cid;
  execute 'reset role';

  -- B (member, not admin) tries admin things
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  begin perform public.add_to_circle(cid, array[d]); out := out || E'\n8 non-admin can''t add people: FAIL';
  exception when others then out := out || E'\n8 non-admin can''t add people: PASS'; end;
  begin perform public.remove_from_circle(cid, c); out := out || E'\n9 non-admin can''t remove people: FAIL';
  exception when others then out := out || E'\n9 non-admin can''t remove people: PASS'; end;
  begin insert into public.circle_members (circle_id, user_id) values (cid, d); out := out || E'\n10 can''t sneak people in directly: FAIL';
  exception when others then out := out || E'\n10 can''t sneak people in directly: PASS'; end;
  execute 'reset role';

  -- A makes B co-admin; B can now add D
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  perform public.set_circle_role(cid, b, 'admin');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  perform public.add_to_circle(cid, array[d]);
  select count(*) into n from public.circle_members where circle_id = cid;
  out := out || E'\n11 co-admin can add people: ' || case when n = 4 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- E: can't see the circle, then joins with the link
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  select count(*) into n from public.circles where id = cid;
  out := out || E'\n12 non-member can''t see the circle: ' || case when n = 0 then 'PASS' else 'FAIL' end;
  begin perform public.join_circle('nope'); out := out || E'\n13 bad invite link rejected: FAIL';
  exception when others then out := out || E'\n13 bad invite link rejected: PASS'; end;
  select * into r from public.circle_preview(code);
  out := out || E'\n14 invite preview shows name + 4 members: ' || case when r.name = 'Test circle' and r.members = 4 then 'PASS' else 'FAIL' end;
  perform public.join_circle(code);
  select count(*) into n from public.circles where id = cid;
  out := out || E'\n15 joined by link, can now see it: ' || case when n = 1 then 'PASS' else 'FAIL' end;
  execute 'reset role';

  -- admins leave → hand-over; everyone leaves → circle deleted
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  perform public.leave_circle(cid); execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  perform public.leave_circle(cid); execute 'reset role';
  select user_id = c into ok from public.circle_members where circle_id = cid and role = 'admin';
  out := out || E'\n16 last admin leaves → longest-standing member (C) becomes admin: ' || case when ok then 'PASS' else 'FAIL' end;
  foreach procedure_as in array array[c::text, d::text, e::text] loop
    perform set_config('request.jwt.claims', json_build_object('sub', procedure_as, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
    perform public.leave_circle(cid); execute 'reset role';
  end loop;
  select count(*) into n from public.circles where id = cid;
  out := out || E'\n17 last person leaves → circle deleted: ' || case when n = 0 then 'PASS' else 'FAIL' end;

  raise exception 'TESTS:%', out;
end $$;
