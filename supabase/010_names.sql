-- Migration 010: name rules. No emoji, and no two members with the same name. Safe to run more than once.
-- "Same" ignores capitals and extra spaces, so "DP", "dp" and " D  P " can't coexist.

-- 1. How names are compared
create or replace function public.norm_name(n text) returns text
language sql immutable as $$ select lower(btrim(regexp_replace(n, '\s+', ' ', 'g'))) $$;

-- 2. Uniqueness, enforced by the database itself (also stops two people grabbing a name at the same moment)
create unique index if not exists profiles_name_unique on public.profiles (public.norm_name(name));

-- 3. No emoji / invisible characters. Only checked when a name is set or CHANGED, so a member with an old
--    emoji name can still change their other settings until they rename (the app asks them to).
create or replace function public.check_name() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.name is not distinct from old.name then return new; end if;
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  if new.name ~ '[\U0001F000-\U0001FAFF☀-➿⌀-⏿⬀-⯿️​-‍⁠﻿]'
     or new.name ~ '[[:cntrl:]]' then
    raise exception 'NAME_RULES: no emoji in names' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists profiles_check_name on public.profiles;
create trigger profiles_check_name before insert or update of name on public.profiles
  for each row execute function public.check_name();

-- 4. "Is this name taken?" for the sign-up screen. Answers yes/no only, and can see private members too.
create or replace function public.name_taken(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where norm_name(name) = norm_name(p_name) and id is distinct from auth.uid())
$$;
revoke all on function public.name_taken(text) from public, anon;
grant execute on function public.name_taken(text) to authenticated;
