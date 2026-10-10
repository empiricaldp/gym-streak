-- Migration 020: Watchers. Some people join just to keep an eye on their friends: no split, no streak,
-- not on the leaderboards. They can still bud, nudge, react, chat and be in circles. Safe to run more than once.
alter table public.profiles add column if not exists watcher boolean not null default false;

-- "people" view: same as 011, plus the watcher flag at the end (so the app can show "Watching" instead of a streak)
create or replace view public.people with (security_invoker = false) as
select
  p.id, p.name, p.plate, p.created_at,
  is_private(p.id) as private,
  can_see(auth.uid(), p.id) as visible,
  case when not can_see(auth.uid(), p.id) then null
       when p.id = auth.uid() or not hides_split(p.id) then p.plan
       else (select jsonb_agg(case when e = 'null'::jsonb then 'null'::jsonb
                                   else jsonb_build_object('w', null, 'opt', coalesce(e->'opt', 'false'::jsonb)) end order by i)
             from jsonb_array_elements(p.plan) with ordinality as t(e, i)) end as plan,
  case when can_see(auth.uid(), p.id) then p.since end as since,
  case when can_see(auth.uid(), p.id) then p.track_start end as track_start,
  hides_split(p.id) as split_hidden,
  case when p.id = auth.uid() then p.account end as account,
  case when p.id = auth.uid() then p.seen_update end as seen_update,
  (select b.status from buds b where b.follower = auth.uid() and b.followee = p.id) as i_bud,      -- my bud with them
  (select b.status from buds b where b.follower = p.id and b.followee = auth.uid()) as they_bud,   -- their bud with me
  -- Profile counts (like Instagram): Spotting = everyone they bud, Spotters = everyone who buds them,
  -- Buds = people on both lists (so a Bud also counts once in Spotting and once in Spotters)
  (select count(*) from buds x where x.follower = p.id and x.status = 'accepted'
     and exists (select 1 from buds y where y.follower = x.followee and y.followee = p.id and y.status = 'accepted'))::int as n_buds,
  (select count(*) from buds x where x.follower = p.id and x.status = 'accepted')::int as n_spotting,
  (select count(*) from buds x where x.followee = p.id and x.status = 'accepted')::int as n_spotters,
  p.watcher                                                       -- 020: here to watch, no split
from public.profiles p
where auth.uid() is not null;
revoke all on public.people from public, anon;
grant select on public.people to authenticated;
