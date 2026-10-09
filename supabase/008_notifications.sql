-- Migration 008: phone notifications (Web Push). Safe to run more than once.
-- Needs the "push" edge function deployed (supabase/functions/push) with JWT verification OFF.
-- The VAPID private key is NOT in this file (the repo is public): it's inserted separately, see step 4.

create extension if not exists pg_net;    -- lets the database make web requests (to call the push function)
create extension if not exists pg_cron;   -- lets the database run something on a timer

-- ---------- 1. Your notification settings (on your own profile row: only you can read it) ----------
alter table public.profiles add column if not exists notif_nudge  boolean not null default true;
alter table public.profiles add column if not exists notif_react  boolean not null default true;
alter table public.profiles add column if not exists notif_crew   boolean not null default true;
alter table public.profiles add column if not exists notif_remind boolean not null default true;
alter table public.profiles add column if not exists remind_at    time    not null default '19:00';
alter table public.profiles add column if not exists reminded_on  date;     -- so the reminder only goes once a day

-- ---------- 2. Push addresses: one row per phone/laptop that turned notifications on ----------
create table if not exists public.push_subs (
  endpoint   text primary key check (endpoint like 'https://%' and char_length(endpoint) < 1000),
  user_id    uuid not null references auth.users(id) on delete cascade,
  p256dh     text not null check (char_length(p256dh) < 200),
  auth       text not null check (char_length(auth) < 100),
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user on public.push_subs(user_id);
alter table public.push_subs enable row level security;
drop policy if exists "see own push subs" on public.push_subs;
create policy "see own push subs" on public.push_subs for select to authenticated using (auth.uid() = user_id);

-- Saving goes through these helpers: if a friend logs in on the same phone, the address moves to them.
create or replace function public.save_push_sub(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  insert into push_subs (endpoint, user_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
  -- keep at most 10 devices per person
  delete from push_subs where user_id = auth.uid() and endpoint not in
    (select endpoint from push_subs where user_id = auth.uid() order by created_at desc limit 10);
end $$;
create or replace function public.remove_push_sub(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_subs where endpoint = p_endpoint and user_id = auth.uid();
$$;
revoke all on function public.save_push_sub(text, text, text) from public, anon;
revoke all on function public.remove_push_sub(text) from public, anon;
grant execute on function public.save_push_sub(text, text, text) to authenticated;
grant execute on function public.remove_push_sub(text) to authenticated;

-- ---------- 3. Server-only tables (RLS on, no policies = only the push function can touch them) ----------
create table if not exists public.push_log (           -- what's been sent, so nothing goes out twice
  kind text not null, to_user uuid not null, ref text not null, day date not null,
  created_at timestamptz not null default now(),
  primary key (kind, to_user, ref, day)
);
alter table public.push_log enable row level security;
create table if not exists public.push_config (k text primary key, v text not null);
alter table public.push_config enable row level security;
revoke all on public.push_log, public.push_config from anon, authenticated;

-- ---------- 4. VAPID keys (run separately with the real private key; never commit it) ----------
-- insert into public.push_config (k, v) values ('vapid_public', '...'), ('vapid_private', '...')
--   on conflict (k) do update set v = excluded.v;

-- ---------- 5. Who's due a gym reminder right now ----------
-- Gym day (not rest, not optional), not ticked yet, reminder time passed in the last 30 min, not reminded yet today.
create or replace function public.due_reminders() returns table (uid uuid, workout text)
language plpgsql security definer set search_path = public as $$
declare
  n timestamp := now() at time zone 'Australia/Sydney';
  d date := n::date;
  i int := extract(isodow from n)::int - 1;     -- Mon = 0 … Sun = 6, same as the plan
begin
  delete from push_log where day < d - 14;      -- tidy up while we're here
  return query
  update profiles p set reminded_on = d
  where p.notif_remind
    and p.remind_at <= n::time and p.remind_at > (n - interval '30 minutes')::time
    and p.reminded_on is distinct from d
    and jsonb_typeof(p.plan -> i) = 'object'
    and not coalesce((p.plan -> i ->> 'opt')::boolean, false)
    and not exists (select 1 from checkins c where c.user_id = p.id and c.day = d)
    and exists (select 1 from push_subs s where s.user_id = p.id)
  returning p.id, p.plan -> i ->> 'w';
end $$;
revoke all on function public.due_reminders() from public, anon, authenticated;
grant execute on function public.due_reminders() to service_role;

-- ---------- 6. Triggers: tell the push function when something happens ----------
-- net.http_post is queued and sent in the background, so ticking never waits on notifications,
-- and if notifications break, ticking still works (the exception handler swallows the error).
create or replace function public.push_notify() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url     := 'https://ktmntyzswewnnxpzzuhb.supabase.co/functions/v1/push',
    body    := jsonb_build_object('type', tg_table_name, 'record', to_jsonb(new)),
    headers := '{"Content-Type":"application/json"}'::jsonb);
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.push_notify() from public, anon, authenticated;

drop trigger if exists push_nudge on public.nudges;
create trigger push_nudge after insert on public.nudges for each row execute function public.push_notify();
drop trigger if exists push_reaction on public.reactions;
create trigger push_reaction after insert on public.reactions for each row execute function public.push_notify();
drop trigger if exists push_checkin on public.checkins;
create trigger push_checkin after insert on public.checkins for each row
  when (new.day = (now() at time zone 'Australia/Sydney')::date)
  execute function public.push_notify();

-- ---------- 7. Timer: check for due reminders every 5 minutes ----------
select cron.unschedule('push-reminders') where exists (select 1 from cron.job where jobname = 'push-reminders');
select cron.schedule('push-reminders', '*/5 * * * *', $cron$
  select net.http_post(url := 'https://ktmntyzswewnnxpzzuhb.supabase.co/functions/v1/push',
                       body := '{"type":"reminders"}'::jsonb,
                       headers := '{"Content-Type":"application/json"}'::jsonb);
$cron$);
