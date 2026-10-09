-- Migration 014: a circle can have no emoji (the app then shows the first letter of its name). Safe to run more than once.
alter table public.circles drop constraint if exists circles_emoji_check;
alter table public.circles add constraint circles_emoji_check check (char_length(emoji) <= 16);

create or replace function public.create_circle(p_name text, p_emoji text, p_members uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; me uuid := auth.uid();
begin
  if me is null or not exists (select 1 from profiles where id = me) then raise exception 'sign in first'; end if;
  insert into circles (name, emoji, created_by) values (btrim(p_name), coalesce(btrim(p_emoji), ''), me) returning id into cid;   -- '' = no emoji
  insert into circle_members (circle_id, user_id, role) values (cid, me, 'admin');
  insert into circle_members (circle_id, user_id, role, added_by)
    select cid, p.id, 'member', me from profiles p where p.id = any(coalesce(p_members, '{}')) and p.id <> me
    on conflict do nothing;
  return cid;
end $$;

create or replace function public.edit_circle(p_circle uuid, p_name text, p_emoji text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_circle_admin(p_circle, auth.uid()) then raise exception 'only admins can edit the circle'; end if;
  update circles set name = btrim(p_name), emoji = coalesce(btrim(p_emoji), emoji) where id = p_circle;   -- '' = remove the emoji
end $$;
