-- Migration 017: security hardening after the beta bug hunt. Safe to run more than once.

-- ---------- 1. The push function only listens to the database (shared secret) ----------
-- Before: anyone on the internet could POST to the push function and make it re-send notifications.
-- Now the database sends a secret header that the function checks.
insert into public.push_config (k, v)
values ('hook_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (k) do nothing;

create or replace function public.push_notify() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url     := 'https://ktmntyzswewnnxpzzuhb.supabase.co/functions/v1/push',
    body    := jsonb_build_object('type', tg_table_name, 'record', to_jsonb(new)),
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-push-secret', (select v from push_config where k = 'hook_secret')));
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.push_notify() from public, anon, authenticated;

select cron.unschedule('push-reminders') where exists (select 1 from cron.job where jobname = 'push-reminders');
select cron.schedule('push-reminders', '*/5 * * * *', $cron$
  select net.http_post(url := 'https://ktmntyzswewnnxpzzuhb.supabase.co/functions/v1/push',
                       body := '{"type":"reminders"}'::jsonb,
                       headers := jsonb_build_object('Content-Type', 'application/json',
                                                     'x-push-secret', (select v from public.push_config where k = 'hook_secret')));
$cron$);

-- ---------- 2. Circles: you can't drag a PRIVATE person into a circle unless you're Buds ----------
-- (Being in a circle lets members see your sessions and split, so it mustn't skip a private account's approval.)
-- Public people and your Buds still go straight in, like WhatsApp; anyone can still join with the invite link.
create or replace function public.can_add_to_circle(adder uuid, who uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not is_private(who) or (is_bud(adder, who) and is_bud(who, adder))
$$;
create or replace function public.create_circle(p_name text, p_emoji text, p_members uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; me uuid := auth.uid();
begin
  if me is null or not exists (select 1 from profiles where id = me) then raise exception 'sign in first'; end if;
  insert into circles (name, emoji, created_by) values (btrim(p_name), coalesce(btrim(p_emoji), ''), me) returning id into cid;
  insert into circle_members (circle_id, user_id, role) values (cid, me, 'admin');
  insert into circle_members (circle_id, user_id, role, added_by)
    select cid, p.id, 'member', me from profiles p
    where p.id = any(coalesce(p_members, '{}')) and p.id <> me and can_add_to_circle(me, p.id)
    on conflict do nothing;
  return cid;
end $$;
create or replace function public.add_to_circle(p_circle uuid, p_members uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_circle_admin(p_circle, auth.uid()) then raise exception 'only admins can add people'; end if;
  insert into circle_members (circle_id, user_id, role, added_by)
    select p_circle, p.id, 'member', auth.uid() from profiles p
    where p.id = any(coalesce(p_members, '{}')) and can_add_to_circle(auth.uid(), p.id)
    on conflict do nothing;
end $$;
revoke all on function public.can_add_to_circle(uuid, uuid) from public, anon;
grant execute on function public.can_add_to_circle(uuid, uuid) to authenticated;

-- ---------- 3. The server sets the time on nudges and messages (no back-dating to dodge limits) ----------
create or replace function public.stamp_now() returns trigger
language plpgsql as $$ begin new.created_at := now(); return new; end $$;
drop trigger if exists nudges_stamp on public.nudges;
create trigger nudges_stamp before insert on public.nudges for each row execute function public.stamp_now();

-- messages: server time + at most 30 a minute per person (stops spam floods)
create or replace function public.message_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if (select count(*) from messages where from_user = new.from_user and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'slow down: too many messages';
  end if;
  return new;
end $$;
create index if not exists messages_from on public.messages (from_user, created_at);
drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before insert on public.messages for each row execute function public.message_guard();

-- the person who got a nudge may only mark it seen (not rewrite who sent it or when)
revoke update on public.nudges from authenticated;
grant update (seen) on public.nudges to authenticated;

-- ---------- 4. Sessions: only the last month can be ticked (no back-filling a fake year-long streak) ----------
drop policy if exists "insert own checkins" on public.checkins;
create policy "insert own checkins" on public.checkins for insert to authenticated
  with check (auth.uid() = user_id and day <= public.local_today(auth.uid()) + 1
              and day >= public.local_today(auth.uid()) - 31);

-- ---------- 5. One streak freeze per month, even if two are sent at the same instant ----------
create unique index if not exists freezes_one_per_month on public.freezes (user_id, (date_trunc('month', day::timestamp)));

-- ---------- 6. Keep the old (live app) and new (beta) privacy settings in step ----------
-- Before: changing privacy in one app left the other app's setting behind, and the more open one won.
create or replace function public.sync_privacy() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.account is not distinct from old.account and new.hide_split is not distinct from old.hide_split then
    -- the live app changed its old switches: carry them over to the new settings
    if new.account is not null and (new.is_public is distinct from old.is_public or new.share_attendance is distinct from old.share_attendance) then
      new.account := case when new.is_public and new.share_attendance then 'public' else 'private' end;
    end if;
    if new.account is not null and new.share_split is distinct from old.share_split then
      new.hide_split := not new.share_split;
    end if;
  elsif new.account is not null then
    -- the beta changed the new settings: carry them over to the old switches
    new.is_public := new.account = 'public';
    new.share_attendance := new.account = 'public';
    new.share_split := not new.hide_split;
  end if;
  return new;
end $$;
drop trigger if exists profiles_sync_privacy on public.profiles;
create trigger profiles_sync_privacy before insert or update on public.profiles for each row execute function public.sync_privacy();

-- ---------- 7. Gym reminders set between midnight and 12:30am now fire too ----------
create or replace function public.due_reminders() returns table (uid uuid, workout text)
language plpgsql security definer set search_path = public as $$
begin
  delete from push_log where day < (now() at time zone 'Australia/Sydney')::date - 14;
  return query
  with t as (select p.id, (now() at time zone p.tz) as n from profiles p where p.notif_remind)
  update profiles p set reminded_on = t.n::date
  from t
  where p.id = t.id
    and (t.n::date + p.remind_at) <= t.n and (t.n::date + p.remind_at) > t.n - interval '30 minutes'
    and p.reminded_on is distinct from t.n::date
    and jsonb_typeof(p.plan -> (extract(isodow from t.n)::int - 1)) = 'object'
    and not coalesce((p.plan -> (extract(isodow from t.n)::int - 1) ->> 'opt')::boolean, false)
    and not exists (select 1 from checkins c where c.user_id = p.id and c.day = t.n::date)
    and exists (select 1 from push_subs s where s.user_id = p.id)
  returning p.id, p.plan -> (extract(isodow from t.n)::int - 1) ->> 'w';
end $$;
revoke all on function public.due_reminders() from public, anon, authenticated;
grant execute on function public.due_reminders() to service_role;
