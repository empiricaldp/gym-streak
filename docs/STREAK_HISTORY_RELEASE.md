# Preserve earned streaks when a split changes

A five-day split used to replace the schedule used for every past date. A six-to-five-day edit could reduce a completed seven-week run from 44 to 37. Split versions now retain the schedule that applied on each date, including rest and optional days. New edits take effect tomorrow in the member's saved timezone; repeat edits before then replace only tomorrow's pending schedule. Existing logs are untouched.

Migration 031 captures future changes at the database boundary, including writes from old app versions. It establishes the current split as the baseline for existing accounts. It cannot infer splits that were overwritten before installation. Correct any such account only from confirmed historical information; do not manufacture check-ins or hard-code a displayed streak.

## Release order

Follow `RELEASE_CHECKLIST.md`: DP approves each database change separately.

1. Obtain DP's approval for migration 031. Inspect the live schema and back up existing function definitions before applying any changes. Dry-run 031 inside a transaction that rolls back (replace its final `commit` with `rollback`); confirm compatibility with the live `people` view.
2. Apply `supabase/031_split_history.sql`. No check-ins are edited. Verify the new view under a real member session and verify hidden split names stay hidden.
3. Deploy the updated push function, then publish the beta v63 and verify a split edit against a test account. The push function now requires migration 031.
4. Publish main v54 only after database and beta validation. The history view is required; a failed history read retains the prior complete snapshot rather than recalculating with an incomplete schedule.
5. Apply any separately reviewed account recovery after verifying the member's original rest days and the period affected. The personal recovery script is kept outside the public repository.

The SQL helper for gym reminders uses the dated split, so today's reminders don't pick up tomorrow's plan. Long-standing dated swaps also remain loaded for streak calculations. Changes to a profile refresh its dated history on other devices.

## Verification

From the repository root, with Node.js 24:

```
node --check app.js
node --check beta/app.js
node tests/split.test.js
node tests/streak-history.test.js
node tests/streak-push.test.js
```

For the PostgreSQL tests, install `@electric-sql/pglite` in an isolated test directory. Set `PGLITE_MODULE` to the absolute path of that package's `dist/index.js`, then run:

```
node tests/streak-history-db.test.mjs
```

Database tests run only against an ephemeral PostgreSQL instance. They cover repeatable migration, snapshots on new accounts, repeated edits, next-day activation, rollback, restricted writes, owner-only raw history, hidden labels, blocked profiles, and anonymous denial. The app tests use real calculation functions extracted from both builds; notification tests use the real push calculation.

## Rollback

Restore frontend v53/b62 and the previous push deployment first. Then run `supabase/rollback/031_rollback.sql` to disable capture and restore the former reminder function. History is deliberately retained. Never delete the history table as part of rollback: it contains earned schedule history.
