# Gym Streak

A phone-first app for a crew of friends to log gym sessions, keep streaks alive and compete.

**Live app:** https://empiricaldp.github.io/gym-streak/
On iPhone: open it in Safari → Share → **Add to Home Screen**.

## How it's built

| Piece | What it does |
|---|---|
| `index.html` | The page skeleton and the tab bar |
| `styles.css` | The look: concrete greys, condensed signage type, plate colours |
| `app.js` | Everything the app does: screens, streak maths, login, saving |
| `config.js` | The Supabase address + public key |
| `manifest.webmanifest` + `icons/` | Makes it installable with its own icon |
| `sw.js` | Service worker: caches the app so it opens instantly |
| `supabase/schema.sql` | Database tables + the security rules |

**Frontend** (these files) is hosted free on GitHub Pages.
**Backend** (logins + data) is Supabase.

## How the streak maths works

The database only stores raw facts: *who* trained on *which day*. Streaks, week numbers and
milestones are worked out from those facts every time the app loads. Storing facts and deriving
totals means numbers can never drift out of sync.

- **Gym day** = a day in your split that isn't marked optional. Only gym days build or break a streak.
- **Day streak** = gym days in a row you've ticked. Rest days are skipped over.
- **Week number** = full weeks in a row you hit every gym day, plus the current one.
- Weeks you'd already trained before joining count as done.
- Sign-up asks two separate things: **how long you've been going to the gym** (experience, private, `trained_since`)
  and **how long you've been going consistently** (sets `since`, i.e. your starting streak). Both take a typed number
  plus days / weeks / months / years.

## Privacy

Everyone chooses what the crew sees: share everything (recommended), hide their split,
hide attendance, or go fully private. This is enforced in the database (`supabase/002_privacy.sql`):
other people's phones never even receive the hidden data. `supabase/tests/privacy_test.sql`
checks the rules and undoes itself.

## Database changes

Run the files in `supabase/` in order in the SQL Editor: `schema.sql`, `002_privacy.sql`, `003_steps.sql`,
`004_member_count.sql`, `005_social_body.sql`, `006_more_plates.sql`, `007_goals_experience.sql`,
`008_notifications.sql` (then insert the VAPID keys into `push_config`, see the file).
Tests in `supabase/tests/` print PASS/FAIL and undo themselves.

## Apple Health steps (paused)

Hidden in the app for now (`STEPS_ENABLED = false` in `app.js`) because the iPhone setup was too much effort.
The database, `log_steps` and the `log-steps` edge function (`supabase/functions/`) stay live, so flipping the switch brings it back.

Web apps can't read Apple Health, so an iPhone **Shortcut** does it: it sums today's steps and POSTs
`{p_key, p_steps}` to `/rest/v1/rpc/log_steps`. `p_key` is each person's secret steps key (shown in the
You tab). Steps are private unless the person turns on sharing.

## Social & body

- **Reactions** (🔥 💪 👏) on friends' sessions, **nudges** (one per friend per day), both limited to people who share attendance.
- **Streak freeze**: one per calendar month for a missed day in the last week. Keeps the streak (doesn't add to it) and counts toward the week's target.
- **Goal, height and weight log are private**: only the owner can read them. BMI is worked out in the app.
- **Weekly recap** in Trophies, with a 1080×1350 share image drawn on a canvas.

## Staying logged in & Face ID lock

- The app waits for the saved login to be checked (a "Loading…" splash) before deciding to show sign-in.
  Showing the sign-in form during that check made people think they'd been logged out.
- Optional **Face ID / fingerprint lock** (You tab → Security): WebAuthn with the phone's built-in biometrics.
  It's a lock on this device only; it asks on open and after a minute in the background. Nothing biometric leaves the phone.

## Notifications (Web Push)

- Types: **nudges**, **reactions**, **crew activity** (a friend logs today's session, only if they share attendance)
  and a **gym reminder** at a time each person picks (gym days only, skipped if already logged). Each has its own switch in the You tab.
- On iPhone it needs iOS 16.4+ and the app opened from the Home Screen.
- Flow: the phone gives us a push address + keys → saved in `push_subs` → database triggers on `nudges`, `reactions`
  and `checkins` call the `push` edge function (via `pg_net`) → it encrypts the message (RFC 8291) and signs it with
  our VAPID key (RFC 8292) → Apple/Google deliver it → `sw.js` shows it.
- Reminders: `pg_cron` job `push-reminders` calls the function every 5 minutes; `due_reminders()` picks who's due.
- The `push` function runs with JWT verification **off** (the database calls it without a login). It re-reads every
  record before sending and logs sends in `push_log`, so faked calls can't invent notifications or send duplicates.
- VAPID public key is in `config.js`; the private key is only in the `push_config` table (never in this repo).

## Security in one line

The public key in `config.js` only lets people do what the **Row Level Security** rules in
`schema.sql` allow: signed-in members can read the crew's data, and can only change their own.

## Releasing an update

Bump the version number **8 → 9** (etc.) in four places, then push:
`version.json`, `APP_VERSION` in `app.js`, the `?v=` on the three files in `index.html`, and `CACHE` + `SHELL` in `sw.js`.
Open apps notice `version.json` changed and reload themselves.
