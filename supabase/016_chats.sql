-- Migration 016: chats. ADDITIVE: the live app doesn't use any of this. Safe to run more than once.
--   * Buds (both bud each other) can message each other 1-on-1.
--   * Each circle has one group chat for its members.
--   * Text + emoji only (1–1000 characters). You can delete your own messages.
--   * If you stop being Buds / leave the circle, you can still read the old chat but can't send.

-- ---------- 1. Messages ----------
create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  from_user  uuid not null references public.profiles(id) on delete cascade,
  to_user    uuid references public.profiles(id) on delete cascade,     -- set for a 1-on-1 chat
  circle_id  uuid references public.circles(id) on delete cascade,      -- set for a circle chat
  body       text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  check ((to_user is null) <> (circle_id is null)),                     -- exactly one of the two
  check (to_user is null or to_user <> from_user)
);
create index if not exists messages_circle on public.messages (circle_id, created_at) where circle_id is not null;
create index if not exists messages_dm     on public.messages (least(from_user, to_user), greatest(from_user, to_user), created_at) where to_user is not null;
create index if not exists messages_to     on public.messages (to_user, created_at) where to_user is not null;
alter table public.messages enable row level security;

drop policy if exists "read my chats" on public.messages;
create policy "read my chats" on public.messages for select to authenticated
  using (auth.uid() = from_user or auth.uid() = to_user
         or (circle_id is not null and public.is_circle_member(circle_id, auth.uid())));
drop policy if exists "message buds" on public.messages;
create policy "message buds" on public.messages for insert to authenticated
  with check (auth.uid() = from_user and to_user is not null
              and public.is_bud(auth.uid(), to_user) and public.is_bud(to_user, auth.uid()));
drop policy if exists "message my circles" on public.messages;
create policy "message my circles" on public.messages for insert to authenticated
  with check (auth.uid() = from_user and circle_id is not null and public.is_circle_member(circle_id, auth.uid()));
drop policy if exists "delete my messages" on public.messages;
create policy "delete my messages" on public.messages for delete to authenticated using (auth.uid() = from_user);

-- ---------- 2. "Read up to here" markers (for unread counts) ----------
-- chat = 'd:<their id>' for a 1-on-1, 'c:<circle id>' for a circle
create table if not exists public.chat_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat    text not null check (chat ~ '^[dc]:[0-9a-f-]{36}$'),
  read_at timestamptz not null default now(),
  primary key (user_id, chat)
);
alter table public.chat_reads enable row level security;
drop policy if exists "my read markers" on public.chat_reads;
create policy "my read markers" on public.chat_reads for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- 3. Message notifications (with an off switch) ----------
alter table public.profiles add column if not exists notif_chat boolean not null default true;
drop trigger if exists push_message on public.messages;
create trigger push_message after insert on public.messages for each row execute function public.push_notify();

-- ---------- 4. Live updates ----------
do $$ begin
  begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end;
end $$;
