-- Undo 030. Chats people deleted will show their old messages again; deleted circles can't be brought back.
drop function if exists public.delete_circle(uuid);
alter table public.chat_reads drop column if exists cleared_at;
