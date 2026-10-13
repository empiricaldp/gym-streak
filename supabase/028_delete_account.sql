-- 028 (PREPARED, NOT YET APPLIED): "Delete my account" — the person removes themselves completely, from inside the app.
-- Needed before CREW goes public (app stores and privacy law expect people to be able to delete their own data).
--
-- What happens when someone deletes their account:
--   * Circles first: they leave each circle the normal way, so if they were the only admin, the longest-standing
--     member becomes admin, and a circle with nobody left is removed.
--   * Then their sign-in (auth.users) is deleted. Every CREW table is linked to it with "on delete cascade", so the
--     database removes in the same step: profile, gym days, freezes, workouts, plans, swaps, body weight, steps,
--     buds both ways, messages they sent and received, nudges, reactions, reports they made or that were about them,
--     blocks, rest alarms, phone notification subscriptions, backups.
--   * Their lines in the notification log (push_log) are deleted too (that table has no link, so it's done by hand).
-- Safety:
--   * Only ever deletes the person who is signed in (auth.uid()); nobody can delete someone else.
--   * They must send the word DELETE, so a stray tap or bug can't trigger it.
--   * It's all one transaction: if any step fails, nothing is deleted.
-- This cannot be undone (that's the point). ROLLBACK of the migration itself at the bottom.

create or replace function public.delete_my_account(confirm text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare me uuid := auth.uid(); c uuid;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if confirm is distinct from 'DELETE' then raise exception 'type DELETE to confirm' using errcode = '22023'; end if;
  for c in select circle_id from circle_members where user_id = me loop
    perform leave_circle(c);                    -- same rules as tapping "Leave" (admin hand-over, empty circle removed)
  end loop;
  delete from push_log where to_user = me;
  delete from auth.users where id = me;         -- everything else cascades from here
end $$;
revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;

-- ROLLBACK (removes the button's server side; deleted accounts stay deleted):
--   drop function if exists public.delete_my_account(text);
