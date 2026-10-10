-- Buds v2 test (019). Pretend users; UNDOES ITSELF (ends with an error on purpose).
do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000aa'; p uuid := '00000000-0000-0000-0000-0000000000bb';
  q uuid := '00000000-0000-0000-0000-0000000000cc'; n uuid := '00000000-0000-0000-0000-0000000000dd';
  out text := ''; st text; ts timestamptz; acc text; nb boolean;
  td date := (now() at time zone 'Australia/Sydney')::date;
  pl jsonb := '[null,null,null,null,null,null,null]';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x || '@example.invalid', '', now(), now() from unnest(array[a,p,q,n]) x;
  insert into public.profiles (id, name, plate, plan, since, track_start, account) values
    (a,'Bv A','red',pl,td,td,'public'), (p,'Bv P','red',pl,td,td,'private'), (q,'Bv Q','red',pl,td,td,'private');
  insert into public.profiles (id, name, plate, plan, since, track_start) values (n,'Bv N','red',pl,td,td);   -- brand-new, picks nothing
  select account, notif_buds into acc, nb from public.profiles where id = n;
  out := out || E'\n1 new account is Private by default: ' || case when acc = 'private' then 'PASS' else 'FAIL ' || coalesce(acc,'null') end;
  out := out || E'\n2 Buds notifications on by default: ' || case when nb then 'PASS' else 'FAIL' end;

  -- P (private) buds A (public): instant. Then A buds P back: no request needed, they're Buds straight away
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  insert into public.buds (follower, followee) values (p, a);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  insert into public.buds (follower, followee) values (a, p);
  insert into public.buds (follower, followee) values (a, q);          -- Q private and doesn't bud A: still a request
  execute 'reset role';
  select status into st from public.buds where follower = a and followee = p;
  out := out || E'\n3 budding back a private person who already buds you = accepted: ' || case when st = 'accepted' then 'PASS' else 'FAIL ' || st end;
  select status into st from public.buds where follower = a and followee = q;
  out := out || E'\n4 budding a private stranger = still a request: ' || case when st = 'pending' then 'PASS' else 'FAIL ' || st end;

  perform set_config('request.jwt.claims', json_build_object('sub', q, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  perform public.accept_bud(a);
  execute 'reset role';
  select accepted_at into ts from public.buds where follower = a and followee = q;
  out := out || E'\n5 accepting stamps the time (for the "accepted" notification): ' || case when ts > now() - interval '1 minute' then 'PASS' else 'FAIL' end;
  raise exception 'TESTS:%', out; end $$;
