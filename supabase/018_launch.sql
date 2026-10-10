-- Migration 018: launch of Buds/Circles (v43). The old "nudge anyone who shares attendance, once a day" rule goes.
-- Nudges now: Buds every 10 minutes, circle-mates once a day (012/013/015). Safe to run more than once.
drop policy if exists "send nudges" on public.nudges;
