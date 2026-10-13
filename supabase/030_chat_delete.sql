-- Migration 030: delete a chat (just for you) and delete a circle (admins, for everyone). Safe to run more than once.
--  * Delete chat = like WhatsApp "Delete chat": it disappears from YOUR list and its old messages are hidden for you.
--    The other person still has their copy. If someone messages again, the chat comes back with only the new messages.
--    Stored as "cleared up to" on your own chat_reads row (only you can see or change it).
--  * Delete circle = admins only: removes the circle, its members list and its chat for everyone.
--    Reports already filed keep their copy of the reported message (027 copies the text).
-- Undo: supabase/rollback/030_rollback.sql

alter table public.chat_reads add column if not exists cleared_at timestamptz;

create or replace function public.delete_circle(p_circle uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_circle_admin(p_circle, auth.uid()) then raise exception 'only admins can delete a circle'; end if;
  delete from circles where id = p_circle;      -- members + messages go with it (on delete cascade)
end $$;
revoke all on function public.delete_circle(uuid) from public, anon;
grant execute on function public.delete_circle(uuid) to authenticated;
