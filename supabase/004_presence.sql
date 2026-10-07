-- Migration 004: "who's online" (Realtime Presence) for signed-in members only.
-- The app joins a PRIVATE realtime channel called "online". Private channels check these rules,
-- so signed-out visitors can't join it or see who's there. Safe to run more than once.

drop policy if exists "members read online presence"  on realtime.messages;
drop policy if exists "members share online presence" on realtime.messages;

create policy "members read online presence" on realtime.messages
  for select to authenticated
  using (realtime.topic() = 'online' and realtime.messages.extension = 'presence');

create policy "members share online presence" on realtime.messages
  for insert to authenticated
  with check (realtime.topic() = 'online' and realtime.messages.extension = 'presence');
