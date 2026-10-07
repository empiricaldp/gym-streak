-- Migration 006: two more plate colours, lavender and pink. Safe to run more than once.
alter table public.profiles drop constraint if exists profiles_plate_check;
alter table public.profiles add constraint profiles_plate_check
  check (plate in ('red','blue','yellow','green','white','lavender','pink'));
