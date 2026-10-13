# CREW improvement tracker

Source: external read-only review of the beta (13 Oct 2026). Every item below was re-checked against the code before work started.
Legend: **Bug** = verified defect · **UX** = works but confusing · **Scale** = needed before going public · **Q** = needs a product decision.

## Access rules (what the server actually enforces today)

| Who is looking | Public account | Private account |
|---|---|---|
| You | everything | everything |
| A **Spotter** (they bud you; request accepted) | profile, streak, week, split* | profile, streak, week, split* |
| A **Bud** (you bud each other) | + workout details (sets/weights), DMs | + workout details, DMs |
| A circle-mate | sessions + split* in that circle | same (only Buds can add a private person to a circle) |
| Anyone else signed in | profile, streak, week, split* | name + plate only; must send a bud request |
| Not signed in | nothing | nothing |

\* unless "Hide my split" is on. Enforced by the `people` view, `can_see()`, and RLS on `checkins`, `workouts`, `day_swaps`, `messages`.

**Switching to Private only affects NEW people.** Anyone already spotting you keeps access until you remove them (You → Spotters → Remove). Removing them revokes access immediately (server-side, `can_see` checks the live `buds` row).

## Findings

| # | Finding | Type | Verdict after checking code | Status |
|---|---|---|---|---|
| P1 | Workout "Finished" while Today says not logged | Bug | Two records (`checkins`, `workouts`) could drift: undoing a log anywhere except beta b40+ (e.g. main app) left the workout finished. | Fixed in beta app (reconcile on load) + migration 026 prepared (server keeps them in sync for every client) |
| P2 | Private wording contradicts Spotters note | Bug (copy) | Server rule = "Private stops new people"; copy said "only buds you approve". Enforcement correct. | Fixed |
| P3 | Private self on "Public leaderboard" | Bug (copy) | Self-only: others' lists exclude private people (client filter + `people` view hides private stats). | Fixed: labelled "only you see yourself here" |
| P4 | Member badge covers buttons | Bug | Floating pill on every screen. | Fixed: moved into Crew → Everyone header |
| P5 | Finished workout shows "start the timer" text | Bug | No finished-state copy; timers stayed interactive. | Fixed |
| P6 | Crew sub-tabs not "selected" for screen readers | Bug (a11y) | Used `aria-pressed` with `role="tab"`. | Fixed: `aria-selected`, roving tabindex, arrow keys |
| U1 | Buds / Spotting / Spotters unclear | UX | Definitions only in list subtitles. | Fixed: one-line legend on your profile |
| U2 | Today shows full roster before Circles | UX | Unbounded list. | Fixed: Circles first, 5-person preview + See all |
| U3 | Streak measures unexplained | UX | | Fixed: "How streaks work" sheet |
| U4 | Bonus day looks like a normal session in recap | Bug | Recap checked "trained?" before "planned day?", so a rest-day session showed as a planned one. | Fixed: planned day first; bonus = "+" tile + legend |
| U5 | Settings mixes everything | UX | | Done: Privacy & safety (privacy, blocked people) first · Goal & body · Notifications · What's new · Invite · Account last. Support & legal waits for Phase 5 pages |
| N1 | Sign-up doesn't say what CREW is | UX | | Done: 3-line pitch above sign in / sign up |
| N2 | Watchers answer gym questions first | UX | Watch option was buried in the split step. | Done: "What brings you to CREW?" right after the name; watchers get 5 short steps, no gym questions |
| N3 | Nothing to do with zero friends | UX | | Done: "CREW works solo too" + Find people + Invite (share sheet) |
| N4 | No personal progress | UX | | Done: "Last 8 weeks" bars on your profile (planned hit / plan / bonus, sessions per week) |
| N5 | A missed week feels like failure | UX | | Done: calm "Fresh week" / "You're back" card after a missed week (not on recap days) |
| X1 | Trophies "WEEK 1" heading broke mid-word ("WEE / K 1") | Bug | Found while testing; pre-existing. | Fixed |
| S1 | No block / report | Scale (safety) | Not in code. Found while building: the legacy `shares_attendance` read rules would have let a BLOCKED person keep reading a public account's check-ins/freezes/reactions. | Built: migration 027 (not applied) + app UI behind `SAFETY` switch (off) + push filter (not deployed). 23/23 DB checks, UI run-through pass |
| S2 | No account deletion / privacy policy / terms | Scale (store) | Not in code. | Pending (Phase 5) |
| S3 | Everyone list loads every user | Scale | `fetchAll("people")` pages through all rows. | Fixed locally (beta, not published): above 400 members the app loads only you + Buds/Spotting/Spotters + circle-mates, searches Everyone on the server, and loads a stranger's days only when you open them. Below 400 nothing changes. |
| S4 | Names globally unique | Scale | | Pending: handles vs display names (Q) |
| S5 | Beta notification taps open the main app | Bug | Push subscription lives in main app scope. | Pending (Phase 5) |

## Verified extra
- Legacy check-in rule `shares_attendance` lets anyone read check-ins of accounts that are public AND have the old flag on. Private accounts with the flag on: **0 of 36**, and `sync_privacy` keeps it that way. Not a leak; tidy up in Phase 2.
- Migration 026 was run together with its test inside one rolled-back transaction: 5/5 pass, nothing left behind (trigger/function/test user absent afterwards).

## Scale measurements (local test DB, 10,000 fake users, ~48 check-ins each)
| What the app loads | Rows | Time |
|---|---|---|
| Everyone's profiles (old way) | 10,000 | ~6 s |
| Everyone's visible check-ins (old way) | 480,024 | ~70 s (unusable) |
| Scoped: me + ~20 people I know (new way) | ~1,008 | ~0.2 s |
Indexes were already fine; the fix is *what* the app asks for. Open question for DP: the global "Public leaderboard" can't be built from loaded data at that size (needs server-side stats, or limit it to people you know — the beta does the latter when scoped).

## Local test database
`/var/tmp/crewpg` (workspace only): plain Postgres 16 with Supabase stand-ins (auth.uid, roles, cron, pg_net), rebuilt from the repo migrations by `rebuild.sh`; `runtests.sh` runs every DB test. 12 of 15 suites match production; 3 are outdated (written for the Oct 7–8 privacy model, replaced since): privacy_test, social_body_test, steps_test → rewrite later.

## Tests
- Database: `supabase/tests/*.sql` (run in SQL editor; each undoes itself).
- App: headless Playwright scripts against a fake Supabase (scratchpad `qa/`), iPhone sizes 390×844 and 320×640.
- Not covered by automation: real iPhone keyboard, push delivery, installed-PWA background behaviour.
