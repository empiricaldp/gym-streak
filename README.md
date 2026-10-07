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

## Privacy

Everyone chooses what the crew sees: share everything (recommended), hide their split,
hide attendance, or go fully private. This is enforced in the database (`supabase/002_privacy.sql`):
other people's phones never even receive the hidden data. `supabase/tests/privacy_test.sql`
checks the rules and undoes itself.

## Database changes

Run the files in `supabase/` in order in the SQL Editor: `schema.sql`, `002_privacy.sql`, `003_steps.sql`.
Tests in `supabase/tests/` print PASS/FAIL and undo themselves.

## Apple Health steps (paused)

Hidden in the app for now (`STEPS_ENABLED = false` in `app.js`) because the iPhone setup was too much effort.
The database, `log_steps` and the `log-steps` edge function (`supabase/functions/`) stay live, so flipping the switch brings it back.

Web apps can't read Apple Health, so an iPhone **Shortcut** does it: it sums today's steps and POSTs
`{p_key, p_steps}` to `/rest/v1/rpc/log_steps`. `p_key` is each person's secret steps key (shown in the
You tab). Steps are private unless the person turns on sharing.

## Security in one line

The public key in `config.js` only lets people do what the **Row Level Security** rules in
`schema.sql` allow: signed-in members can read the crew's data, and can only change their own.
