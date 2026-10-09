-- Migration 015: every person's "today" is THEIR day, not Sydney's. Safe to run more than once.
-- Before: the database judged dates by Sydney time. Someone in India (5½ hours behind) at 9pm Friday
-- was already "Saturday" to the database, so: gym reminders came at the wrong hour, their evening sessions
-- didn't notify anyone, nudges counted the wrong day, and freezes/reactions near midnight could be refused.
-- Now: the app tells the database the phone's time zone (profiles.tz) and every date rule uses it.
-- Works for both the live app and the beta. People who haven't opened the new version yet stay on Sydney time.

-- ---------- 1. Each person's time zone ----------
alter table public.profiles add column if not exists tz text not null default 'Australia/Sydney';

-- Only real time-zone names are kept (a bad one would break every date rule for that person)
create or replace function public.check_tz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tz is null or not exists (select 1 from pg_timezone_names where name = new.tz) then
    new.tz := case when tg_op = 'UPDATE' then old.tz else 'Australia/Sydney' end;
  end if;
  return new;
end $$;
drop trigger if exists profiles_check_tz on public.profiles;
create trigger profiles_check_tz before insert or update of tz on public.profiles for each row execute function public.check_tz();

-- "What's the date for this person right now?"
create or replace function public.local_today(uid uuid) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select tz from profiles where id = uid), 'Australia/Sydney'))::date
$$;
revoke all on function public.local_today(uuid) from public, anon;
grant execute on function public.local_today(uuid) to authenticated, service_role;

-- ---------- 2. Sessions: no ticking the future (by YOUR date) ----------
drop policy if exists "insert own checkins" on public.checkins;
create policy "insert own checkins" on public.checkins for insert to authenticated
  with check (auth.uid() = user_id and day <= public.local_today(auth.uid()) + 1);

-- ---------- 3. Freezes: a missed day in YOUR last week ----------
create or replace function public.freeze_allowed(uid uuid, d date) returns boolean
language sql stable security definer set search_path = public as $$
  select d between public.local_today(uid) - 7 and public.local_today(uid)
     and not exists (select 1 from public.freezes f
                     where f.user_id = uid and date_trunc('month', f.day) = date_trunc('month', d))
$$;

-- ---------- 4. Reactions: a session from the last week (one day of slack either side for people in other time zones) ----------
drop policy if exists "add reactions" on public.reactions;
create policy "add reactions" on public.reactions for insert to authenticated
  with check (auth.uid() = from_user and public.shares_attendance(to_user)
              and day between public.local_today(auth.uid()) - 8 and public.local_today(auth.uid()) + 1);
drop policy if exists "react to people I can see" on public.reactions;
create policy "react to people I can see" on public.reactions for insert to authenticated
  with check (auth.uid() = from_user and public.can_see(auth.uid(), to_user)
              and day between public.local_today(auth.uid()) - 8 and public.local_today(auth.uid()) + 1);

-- ---------- 5. Nudges: "once a day" means the SENDER's day ----------
alter table public.nudges alter column day set default public.local_today(auth.uid());
create or replace function public.nudged_today(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from nudges where from_user = a and to_user = b and day = public.local_today(a))
$$;
drop policy if exists "send nudges" on public.nudges;                 -- live app: once a day (until launch)
create policy "send nudges" on public.nudges for insert to authenticated
  with check (auth.uid() = from_user and public.shares_attendance(to_user)
              and day = public.local_today(auth.uid()) and seen = false
              and not public.nudged_today(auth.uid(), to_user));
drop policy if exists "nudge buds every 10 min" on public.nudges;     -- Buds: every 10 minutes
create policy "nudge buds every 10 min" on public.nudges for insert to authenticated
  with check (auth.uid() = from_user and public.is_bud(auth.uid(), to_user) and public.is_bud(to_user, auth.uid())
              and day = public.local_today(auth.uid()) and seen = false
              and coalesce(public.last_nudge_at(auth.uid(), to_user) < now() - interval '10 minutes', true));
drop policy if exists "nudge circle-mates once a day" on public.nudges;   -- circle-mates: once a day
create policy "nudge circle-mates once a day" on public.nudges for insert to authenticated
  with check (auth.uid() = from_user and public.shares_circle(auth.uid(), to_user)
              and day = public.local_today(auth.uid()) and seen = false
              and not public.nudged_today(auth.uid(), to_user));

-- ---------- 6. Gym reminders at YOUR reminder time ----------
create or replace function public.due_reminders() returns table (uid uuid, workout text)
language plpgsql security definer set search_path = public as $$
begin
  delete from push_log where day < (now() at time zone 'Australia/Sydney')::date - 14;   -- tidy up while we're here
  return query
  with t as (                                   -- each person's own clock: date, time, weekday (Mon = 0)
    select p.id, (now() at time zone p.tz) as n from profiles p where p.notif_remind
  )
  update profiles p set reminded_on = t.n::date
  from t
  where p.id = t.id
    and p.remind_at <= t.n::time and p.remind_at > (t.n - interval '30 minutes')::time
    and p.reminded_on is distinct from t.n::date
    and jsonb_typeof(p.plan -> (extract(isodow from t.n)::int - 1)) = 'object'
    and not coalesce((p.plan -> (extract(isodow from t.n)::int - 1) ->> 'opt')::boolean, false)
    and not exists (select 1 from checkins c where c.user_id = p.id and c.day = t.n::date)
    and exists (select 1 from push_subs s where s.user_id = p.id)
  returning p.id, p.plan -> (extract(isodow from t.n)::int - 1) ->> 'w';
end $$;
revoke all on function public.due_reminders() from public, anon, authenticated;
grant execute on function public.due_reminders() to service_role;

-- ---------- 7. "X just trained" fires when it's today for THE PERSON WHO TRAINED ----------
drop trigger if exists push_checkin on public.checkins;
create trigger push_checkin after insert on public.checkins for each row
  when (new.day = public.local_today(new.user_id))
  execute function public.push_notify();
