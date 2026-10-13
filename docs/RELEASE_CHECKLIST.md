# CREW release checklist

Use this every time something goes from the beta (/beta/) to the normal app (/).
Rule: **one change at a time, DP approves each database change separately, and every step has a way back.**

## A. Before anything goes live
- [ ] Every database test passes on the local copy (`supabase/tests/local/runtests.sh`). Known outdated: privacy_test, social_body_test, steps_test (fail the same with or without new migrations).
- [ ] Every app test passes (qa/t14–t22), no page errors, at phone sizes 390×844 and 320×640.
- [ ] Each new migration has: a plain-English header, a ROLLBACK block, and a test that undoes itself.
- [ ] Each migration was dry-run on the real database inside a rolled-back test, then checked that nothing was left behind.
- [ ] Main `app.js` and beta `app.js` differ only where intended (`diff` them).
- [ ] Version bumped everywhere: `?v=` in index.html and sw.js, CACHE name in sw.js, version.json, APP_VERSION.

## B. Database changes (one at a time, each with DP's yes)
| # | What | Status | Turn on in app with |
|---|---|---|---|
| 026 | Undo a log also resets that day's workout (with 30-day backup) | Ready, waiting | Remove beta's own client reset afterwards (optional) |
| 027 | Block + report | Ready, waiting | `GYM_SAFETY` flag, then deploy push function's block filter |
| 028 | Delete my account | Ready, waiting | `GYM_DELETE` flag |

For each one:
1. [ ] DP says yes to this specific migration.
2. [ ] Run it in the Supabase SQL editor.
3. [ ] Run its test file; all PASS; check no test rows were left.
4. [ ] Switch on its app flag in the **beta only**; test on DP's phone.
5. [ ] If anything is off: run its ROLLBACK block.

## C. Push function (separate deploy)
- [ ] Diff the live code against the repo version before pasting.
- [ ] Deploy only after 027 is applied (the block filter reads the `blocks` table; it tolerates the table missing).
- [ ] Send one test notification to a test account, not to real members.

## D. Before opening CREW to the public
- [ ] 027 (block/report) and 028 (delete account) live in the normal app.
- [ ] Privacy policy and terms finished, reviewed and linked from sign-up and Settings.
- [ ] Minimum age decided and asked at sign-up.
- [ ] Someone named to check reports (`open_reports` view) at least weekly.
- [ ] A support email that someone reads.
- [ ] Supabase plan checked: backups, database size, monthly users, email sending limits.
- [ ] Scale mode tested (it switches on above 400 members): search, profiles, Buds and Circle leaderboards.
- [ ] Global leaderboard: **not planned** (DP's decision: Buds + Circles only).

## E. Publishing the app (GitHub Pages)
1. [ ] Commit, then push only with DP's go-ahead.
2. [ ] Wait about 1 min, open the site, check the version shown matches.
3. [ ] Open on DP's iPhone (Home Screen app), pull to refresh, confirm the update banner.
4. [ ] Quick smoke test: sign in, log a day, undo it, open Crew, open Chats.
5. [ ] Way back: `git revert` the publish commit and push. The old version returns on next open.

## F. After release
- [ ] Watch for errors and support messages for 24 hours.
- [ ] Update docs/IMPROVEMENT_TRACKER.md.
