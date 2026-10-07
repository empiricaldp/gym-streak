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

## Security in one line

The public key in `config.js` only lets people do what the **Row Level Security** rules in
`schema.sql` allow: signed-in members can read the crew's data, and can only change their own.
