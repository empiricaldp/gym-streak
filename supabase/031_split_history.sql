-- Preserve the split that applied when a streak was earned.
-- Apply before deploying v54/b63. Does not modify check-ins or guessed past splits.
begin;
lock table public.profiles in share row exclusive mode;

create table if not exists public.split_versions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  effective_from date not null,
  plan jsonb not null check (jsonb_typeof(plan) = 'array' and jsonb_array_length(plan) = 7),
  primary key (user_id, effective_from)
);
alter table public.split_versions enable row level security;
-- Only the profile trigger writes history, including changes from older app versions.
revoke all on public.split_versions from public, anon, authenticated;
grant select on public.split_versions to authenticated, service_role;
drop policy if exists "read own split history" on public.split_versions;
create policy "read own split history" on public.split_versions for select to authenticated
  using (user_id = auth.uid());

-- Existing schedules are the only baseline we can establish automatically.
insert into public.split_versions(user_id, effective_from, plan)
select id, least(since, public.local_today(id)), plan from public.profiles
on conflict do nothing;

create or replace function public.capture_split_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into split_versions(user_id, effective_from, plan)
    values (new.id, least(new.since, public.local_today(new.id)), new.plan)
    on conflict do nothing;
  elsif new.plan is distinct from old.plan then
    -- A split edit starts tomorrow in the member's timezone. Today and all
    -- completed days retain their original gym/rest/optional classification.
    insert into split_versions(user_id, effective_from, plan)
    values (old.id, least(old.since, public.local_today(old.id)), old.plan)
    on conflict do nothing;
    insert into split_versions(user_id, effective_from, plan)
    values (new.id, public.local_today(new.id) + 1, new.plan)
    on conflict (user_id, effective_from) do update set plan = excluded.plan;
  end if;
  return new;
end $$;
revoke all on function public.capture_split_version() from public, anon, authenticated;
drop trigger if exists profiles_split_history on public.profiles;
create trigger profiles_split_history after insert or update of plan on public.profiles
  for each row execute function public.capture_split_version();

-- Reuse the people view's visibility decision. Hidden splits expose only the
-- same gym/rest/optional flags as people.plan, never historic exercise names.
create or replace view public.split_history with (security_invoker = false) as
select v.user_id, v.effective_from,
  case when not p.split_hidden or p.id = auth.uid() then v.plan
    else (select jsonb_agg(case when e = 'null'::jsonb then 'null'::jsonb
      else jsonb_build_object('w', null, 'opt', coalesce(e->'opt', 'false'::jsonb)) end order by i)
      from jsonb_array_elements(v.plan) with ordinality as t(e, i)) end as plan
from public.split_versions v join public.people p on p.id = v.user_id
where auth.uid() is not null and p.visible;
revoke all on public.split_history from public, anon;
grant select on public.split_history to authenticated;

-- Internal helper for reminders; never callable as an arbitrary user's data API.
create or replace function public.split_on(uid uuid, d date) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select v.plan from split_versions v where v.user_id = uid
    and v.effective_from <= d order by v.effective_from desc limit 1),
    (select p.plan from profiles p where p.id = uid))
$$;
revoke all on function public.split_on(uuid, date) from public, anon, authenticated;
grant execute on function public.split_on(uuid, date) to service_role;

create or replace function public.due_reminders() returns table (uid uuid, workout text)
language plpgsql security definer set search_path = public as $$
begin
  delete from push_log where day < (now() at time zone 'Australia/Sydney')::date - 14;
  return query
  with t as (select p.id, (now() at time zone p.tz) as n from profiles p where p.notif_remind)
  update profiles p set reminded_on = t.n::date from t
  where p.id = t.id
    and (t.n::date + p.remind_at) <= t.n and (t.n::date + p.remind_at) > t.n - interval '30 minutes'
    and p.reminded_on is distinct from t.n::date
    and jsonb_typeof(public.split_on(p.id, t.n::date) -> (extract(isodow from t.n)::int - 1)) = 'object'
    and not coalesce((public.split_on(p.id, t.n::date) -> (extract(isodow from t.n)::int - 1) ->> 'opt')::boolean, false)
    and not exists (select 1 from checkins c where c.user_id = p.id and c.day = t.n::date)
    and exists (select 1 from push_subs s where s.user_id = p.id)
  returning p.id, public.split_on(p.id, t.n::date) -> (extract(isodow from t.n)::int - 1) ->> 'w';
end $$;
revoke all on function public.due_reminders() from public, anon, authenticated;
grant execute on function public.due_reminders() to service_role;
commit;
