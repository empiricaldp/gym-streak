-- ROLLBACK for 027 (block + report). Restores the EXACT live definitions captured on 2026-10-13 just before 027 was applied.
-- Run in the Supabase SQL editor only if 027 needs undoing. It keeps the blocks/reports tables (they may hold user data):
-- export them first, then drop them by hand if wanted.
drop view if exists public.open_reports;
drop trigger if exists report_fill on public.reports; drop function if exists public.report_fill();
drop policy if exists "no bud if blocked" on public.buds;
drop policy if exists "no DM if blocked" on public.messages;
drop policy if exists "hide messages if blocked" on public.messages;
drop policy if exists "no nudge if blocked" on public.nudges;
drop policy if exists "no reaction if blocked" on public.reactions;
drop policy if exists "hide checkins if blocked" on public.checkins;
drop policy if exists "hide freezes if blocked" on public.freezes;
drop policy if exists "hide reactions if blocked" on public.reactions;
drop trigger if exists block_cleanup on public.blocks;

CREATE OR REPLACE FUNCTION public.can_see(viewer uuid, owner uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select viewer = owner or not is_private(owner) or is_bud(viewer, owner) or shares_circle(viewer, owner)
$function$;

CREATE OR REPLACE FUNCTION public.can_add_to_circle(adder uuid, who uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select not is_private(who) or (is_bud(adder, who) and is_bud(who, adder))
$function$;

create or replace view public.people with (security_invoker = false) as
 SELECT id, name, plate, created_at, is_private(id) AS private, can_see(auth.uid(), id) AS visible,
        CASE
            WHEN (NOT can_see(auth.uid(), id)) THEN NULL::jsonb
            WHEN ((id = auth.uid()) OR (NOT hides_split(id))) THEN plan
            ELSE ( SELECT jsonb_agg(
                    CASE
                        WHEN (t.e = 'null'::jsonb) THEN 'null'::jsonb
                        ELSE jsonb_build_object('w', NULL::unknown, 'opt', COALESCE((t.e -> 'opt'::text), 'false'::jsonb))
                    END ORDER BY t.i) AS jsonb_agg
               FROM jsonb_array_elements(p.plan) WITH ORDINALITY t(e, i))
        END AS plan,
        CASE WHEN can_see(auth.uid(), id) THEN since ELSE NULL::date END AS since,
        CASE WHEN can_see(auth.uid(), id) THEN track_start ELSE NULL::date END AS track_start,
    hides_split(id) AS split_hidden,
        CASE WHEN (id = auth.uid()) THEN account ELSE NULL::text END AS account,
        CASE WHEN (id = auth.uid()) THEN seen_update ELSE NULL::integer END AS seen_update,
    ( SELECT b.status FROM buds b WHERE ((b.follower = auth.uid()) AND (b.followee = p.id))) AS i_bud,
    ( SELECT b.status FROM buds b WHERE ((b.follower = p.id) AND (b.followee = auth.uid()))) AS they_bud,
    (( SELECT count(*) AS count FROM buds x
          WHERE ((x.follower = p.id) AND (x.status = 'accepted'::text) AND (EXISTS ( SELECT 1 FROM buds y
                  WHERE ((y.follower = x.followee) AND (y.followee = p.id) AND (y.status = 'accepted'::text)))))))::integer AS n_buds,
    (( SELECT count(*) AS count FROM buds x WHERE ((x.follower = p.id) AND (x.status = 'accepted'::text))))::integer AS n_spotting,
    (( SELECT count(*) AS count FROM buds x WHERE ((x.followee = p.id) AND (x.status = 'accepted'::text))))::integer AS n_spotters,
    watcher
   FROM profiles p
  WHERE (auth.uid() IS NOT NULL);
-- (blocked_between, my_blocks, reports_today stay harmlessly; drop them too if removing the tables.)
