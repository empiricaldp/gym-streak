-- Migration 012: Buds can nudge each other every 10 minutes. Safe to run more than once.
-- Before: the table itself allowed ONE nudge per person per day (primary key from_user + to_user + day).
-- Now each nudge gets its own id, and the limits are rules instead:
--   Buds (both bud each other) → once every 10 minutes
--   Spotting (one-way bud)     → no nudges
--   Live app's old rule        → once a day (kept only until the new version launches)

-- 1. Each nudge is its own row
alter table public.nudges drop constraint if exists nudges_pkey;
alter table public.nudges add column if not exists id bigint generated always as identity;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'nudges_id_pkey') then
    alter table public.nudges add constraint nudges_id_pkey primary key (id);
  end if;
end $$;
create index if not exists nudges_pair on public.nudges (from_user, to_user, created_at desc);

-- 2. Helpers (security definer: they can see every nudge, so the rules can count them)
create or replace function public.last_nudge_at(a uuid, b uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select max(created_at) from nudges where from_user = a and to_user = b
$$;
create or replace function public.nudged_today(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from nudges where from_user = a and to_user = b and day = (now() at time zone 'Australia/Sydney')::date)
$$;
revoke all on function public.last_nudge_at(uuid, uuid), public.nudged_today(uuid, uuid) from public, anon;
grant execute on function public.last_nudge_at(uuid, uuid), public.nudged_today(uuid, uuid) to authenticated;

-- 3. The rules (any one of them allows the nudge)
drop policy if exists "send nudges" on public.nudges;                -- live app: once a day to anyone sharing attendance
create policy "send nudges" on public.nudges for insert to authenticated
  with check (auth.uid() = from_user and public.shares_attendance(to_user)
              and day = (now() at time zone 'Australia/Sydney')::date and seen = false
              and not public.nudged_today(auth.uid(), to_user));
drop policy if exists "nudge my buds" on public.nudges;              -- one-way spotting: NO nudges (DP's call: nudges are for Buds)
drop policy if exists "nudge buds every 10 min" on public.nudges;    -- Buds (both ways): every 10 minutes
create policy "nudge buds every 10 min" on public.nudges for insert to authenticated
  with check (auth.uid() = from_user and public.is_bud(auth.uid(), to_user) and public.is_bud(to_user, auth.uid())
              and day = (now() at time zone 'Australia/Sydney')::date and seen = false
              and coalesce(public.last_nudge_at(auth.uid(), to_user) < now() - interval '10 minutes', true));
