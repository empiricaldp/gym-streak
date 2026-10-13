-- Privacy rules test (current model: Public / Private accounts, Buds, Circles, "Hide my split").
-- Rewritten Oct 2026: the old version tested the retired share_attendance / share_split switches.
-- UNDOES ITSELF (ends with an error on purpose). Every line should say PASS.
--   A = viewer (public)   B = public, hides split   C = private stranger   D = private, A is an accepted Bud
--   E = private, in a Circle with A   F = private, A's bud request still pending
do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a'; b uuid := '00000000-0000-0000-0000-00000000000b';
  c uuid := '00000000-0000-0000-0000-00000000000c'; d uuid := '00000000-0000-0000-0000-00000000000d';
  e uuid := '00000000-0000-0000-0000-00000000000e'; f uuid := '00000000-0000-0000-0000-00000000000f';
  t date := (now() at time zone 'Australia/Sydney')::date; out text := ''; n int; r record; cid uuid := gen_random_uuid();
  gym jsonb := '[{"w":"Push","opt":false},{"w":"Abs","opt":true},null,null,null,null,null]';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x || '@example.invalid', '', now(), now() from unnest(array[a,b,c,d,e,f]) x;
  insert into public.profiles (id, name, plate, plan, since, track_start, account, hide_split) values
    (a,'PvA','red',gym,t-30,t-30,'public',false), (b,'PvB','red',gym,t-30,t-30,'public',true),
    (c,'PvC','red',gym,t-30,t-30,'private',false), (d,'PvD','red',gym,t-30,t-30,'private',false),
    (e,'PvE','red',gym,t-30,t-30,'private',false), (f,'PvF','red',gym,t-30,t-30,'private',false);
  insert into public.checkins (user_id, day) select x, t from unnest(array[a,b,c,d,e,f]) x;
  insert into public.buds (follower, followee) values (a, d), (a, f);
  update public.buds set status = 'accepted' where follower = a and followee = d;
  update public.buds set status = 'pending'  where follower = a and followee = f;
  insert into public.circles (id, name, created_by) values (cid, 'Pv circle', a);
  insert into public.circle_members (circle_id, user_id, role) values (cid, a, 'admin'), (cid, e, 'member');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select * into r from public.people where id = b;
  out := out || E'\n1 public person: visible, gym days readable: ' || case when r.visible and (select count(*) from checkins where user_id = b) = 1 then 'PASS' else 'FAIL' end;
  out := out || E'\n2 "Hide my split": names blanked, optional days kept: ' || case when r.split_hidden and r.plan->0->>'w' is null and (r.plan->1->>'opt')::boolean and r.plan->2 = 'null'::jsonb then 'PASS' else 'FAIL ' || coalesce(r.plan::text, 'null') end;
  select * into r from public.people where id = c;
  out := out || E'\n3 private stranger: listed by name only (no split, no dates): ' || case when r.name = 'PvC' and not r.visible and r.plan is null and r.since is null then 'PASS' else 'FAIL' end;
  select count(*) into n from public.checkins where user_id = c;
  out := out || E'\n4 private stranger: gym days hidden: ' || case when n = 0 then 'PASS' else 'FAIL ' || n end;
  out := out || E'\n5 private Bud (accepted): visible + gym days: ' || case when (select visible from people where id = d) and (select count(*) from checkins where user_id = d) = 1 then 'PASS' else 'FAIL' end;
  out := out || E'\n6 private circle-mate: visible + gym days: ' || case when (select visible from people where id = e) and (select count(*) from checkins where user_id = e) = 1 then 'PASS' else 'FAIL' end;
  out := out || E'\n7 private, bud request still pending: hidden: ' || case when not (select visible from people where id = f) and (select count(*) from checkins where user_id = f) = 0 then 'PASS' else 'FAIL' end;
  select count(*) into n from public.profiles where id <> a;
  out := out || E'\n8 raw profiles table: only your own row: ' || case when n = 0 then 'PASS' else 'FAIL ' || n end;
  out := out || E'\n9 you see your own full split: ' || case when (select plan->0->>'w' from people where id = a) = 'Push' then 'PASS' else 'FAIL' end;
  out := out || E'\n10 others'' account setting not exposed: ' || case when (select account from people where id = b) is null then 'PASS' else 'FAIL' end;
  begin insert into public.checkins (user_id, day) values (b, t - 1); out := out || E'\n11 can''t tick a day for someone else: FAIL';
  exception when others then out := out || E'\n11 can''t tick a day for someone else: PASS'; end;
  update public.profiles set name = 'Hacked' where id = b; get diagnostics n = row_count;
  out := out || E'\n12 can''t edit someone else''s profile: ' || case when n = 0 then 'PASS' else 'FAIL' end;

  execute 'reset role';
  update public.profiles set account = 'public' where id = c;     -- C switches to Public
  execute 'set local role authenticated';
  out := out || E'\n13 switching to Public shows you straight away: ' || case when (select visible from people where id = c) and (select count(*) from checkins where user_id = c) = 1 then 'PASS' else 'FAIL' end;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin select count(*) into n from public.people; out := out || E'\n14 signed-out: sees nobody: ' || case when n = 0 then 'PASS' else 'FAIL ' || n end;
  exception when others then out := out || E'\n14 signed-out: sees nobody: PASS'; end;
  begin select count(*) into n from public.checkins; out := out || E'\n15 signed-out: no gym days: ' || case when n = 0 then 'PASS' else 'FAIL ' || n end;
  exception when others then out := out || E'\n15 signed-out: no gym days: PASS'; end;
  execute 'reset role';
  raise exception 'TEST RESULTS:%', out;
end $$;
