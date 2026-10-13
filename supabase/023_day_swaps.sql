-- 023: One-day swaps (beta). "Today I'm doing Push instead of Pull" without changing your split.
-- One row = (person, date, what they're doing that day). Your split (profiles.plan) stays as it is.
-- Only gym-to-gym (or rest-to-gym) swaps: you can't swap a gym day to Rest for one day, because that would let you
-- dodge a missed day without using your monthly freeze. (Making a day Rest EVERY week is a split change, done in the editor.)
-- Who sees a swap: the same people who can see your split.

create table if not exists public.day_swaps (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  day        date not null,
  label      text not null check (char_length(btrim(label)) between 1 and 60),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.day_swaps enable row level security;

drop policy if exists "see swaps like the split" on public.day_swaps;
create policy "see swaps like the split" on public.day_swaps for select to authenticated
  using (auth.uid() = user_id or (public.can_see(auth.uid(), user_id) and not public.hides_split(user_id)));
drop policy if exists "add my swaps" on public.day_swaps;
create policy "add my swaps" on public.day_swaps for insert to authenticated
  with check (auth.uid() = user_id and day between public.local_today(auth.uid()) - 1 and public.local_today(auth.uid()) + 7);
drop policy if exists "change my swaps" on public.day_swaps;
create policy "change my swaps" on public.day_swaps for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and day between public.local_today(auth.uid()) - 1 and public.local_today(auth.uid()) + 7);
drop policy if exists "undo my swaps" on public.day_swaps;
create policy "undo my swaps" on public.day_swaps for delete to authenticated
  using (auth.uid() = user_id and day >= public.local_today(auth.uid()) - 1);
grant select, insert, update, delete on public.day_swaps to authenticated;
grant select on public.day_swaps to service_role;    -- notifications say what you actually did ("Push ✓")

do $$ begin
  alter publication supabase_realtime add table public.day_swaps;
exception when duplicate_object then null; end $$;
