-- Migration 019: Buds fixes + private by default. Safe to run more than once.

-- ---------- 1. Private by default ----------
-- Everyone who hasn't picked yet becomes Private (the tour asks them and they can switch to Public any time).
-- The sync trigger (017) carries this over to the old switches too.
alter table public.profiles alter column account set default 'private';
update public.profiles set account = 'private' where account is null;

-- ---------- 2. Bud back someone you already bud = accepted straight away (even if you're private) ----------
create or replace function public.bud_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.status := case
    when not is_private(new.followee) then 'accepted'
    -- the person being budded already buds this person: they obviously know each other, no request needed
    when exists (select 1 from buds b where b.follower = new.followee and b.followee = new.follower and b.status = 'accepted') then 'accepted'
    else 'pending' end;
  if new.status = 'accepted' then new.accepted_at := now(); end if;
  return new;
end $$;

-- when did a request get accepted (for the "X accepted" notification)
alter table public.buds add column if not exists accepted_at timestamptz;
create or replace function public.bud_accepted_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then new.accepted_at := now(); end if;
  return new;
end $$;
drop trigger if exists buds_accepted_at on public.buds;
create trigger buds_accepted_at before update of status on public.buds for each row execute function public.bud_accepted_at();

-- ---------- 3. Notifications: "X budded you", "X wants to be your bud", "X accepted" ----------
alter table public.profiles add column if not exists notif_buds boolean not null default true;

drop trigger if exists push_bud on public.buds;
create trigger push_bud after insert on public.buds for each row execute function public.push_notify();

create or replace function public.push_bud_accept() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url     := 'https://ktmntyzswewnnxpzzuhb.supabase.co/functions/v1/push',
    body    := jsonb_build_object('type', 'bud_accept', 'record', to_jsonb(new)),
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-push-secret', (select v from push_config where k = 'hook_secret')));
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.push_bud_accept() from public, anon, authenticated;
drop trigger if exists push_bud_accept on public.buds;
create trigger push_bud_accept after update of status on public.buds for each row
  when (new.status = 'accepted' and old.status = 'pending')
  execute function public.push_bud_accept();
