-- Roll back the frontend/push to v53/b62 FIRST. Keep history for recovery.
-- Existing check-ins and all captured split versions are retained.
begin;
drop trigger if exists profiles_split_history on public.profiles;
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

commit;
