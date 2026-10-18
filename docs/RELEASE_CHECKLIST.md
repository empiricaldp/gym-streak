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
| 026 | Undo a log also resets that day's workout (with 30-day backup) | **Live 2026-10-13** (test 8/8 on prod; rollback: supabase/rollback/026_rollback.sql) | Remove beta's own client reset afterwards (optional) |
| 027 | Block + report | **Live 2026-10-13** (test 29/29 on prod; rollback: supabase/rollback/027_rollback.sql, exact pre-027 definitions) | `GYM_SAFETY` flag, then deploy push function's block filter |
| 028 | Delete my account | Ready, **on hold** (DP). Required before the App Store | `GYM_DELETE` flag |
| 029 | Health: meals + calories, nightly total | **Live 2026-10-13** (test 22/22 on prod; push function with nightly total deployed 23:35, cron run 200 OK; rollback: supabase/rollback/029_rollback.sql — deletes logged meals) | `GYM_HEALTH` flag (on in b52; heart stays hidden until 029 is live), then deploy push function (nightly total; tolerates 029 missing; previous version saved in supabase/rollback/push_index_before_meals.ts) |
| 030 | Delete chat (for me) + admins delete circle | **Live 2026-10-13** (test 11/11 on prod; rollback: supabase/rollback/030_rollback.sql) | `GYM_CHATDEL` flag (on in b53; delete options stay hidden until 030 is live) |
| 031 | Split history (changing your split doesn't rewrite past streaks) | **Live** (applied by another session; `split_history` view confirmed present 2026-10-18). See docs/STREAK_HISTORY_RELEASE.md | Always on (main v54+) |
| 032 | Macros: protein/carbs/fat per meal, any one field enough; optional daily goals | **Live 2026-10-18** (local test 12/12; rollback: supabase/rollback/032_rollback.sql) | Automatic: app checks for the columns, hides Macros if missing |
| 033 | Calories = only what's typed (undoes 032's 4/4/9 auto-calculation in the kcal column) | **Live 2026-10-18** (local test kcal_typed_test 12/12; rollback: supabase/rollback/033_rollback.sql) | Nothing to switch |

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
- [x] v51 (2026-10-14): normal app = beta b57 (workouts, split tab, timers, Health, chats, report/block, update screens). Rollback: git checkout main-v50-before-launch -- app.js index.html styles.css split.js sw.js version.json, bump to v52 and push.
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
