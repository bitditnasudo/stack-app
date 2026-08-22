# STACK

Daily skincare, supplement, health and habit tracker. One user, no server, no
accounts. A web page on Vercel — not an installable app.

The protocol is **editable in the app**: add tasks, tag them, name the kinds of
day they run on (active days, rest days, whatever you call them) and the app
rebuilds the checklist — and the reminders — around it.

Built on the [Vantarco UI template](../../VANTARCO%20APP%20DATABASE/) — React 18
+ Vite 5 + react-router-dom, on the kit's **wine after dark** theme. Dark only.

**Live:** <https://stack-app-flame-phi.vercel.app> — Vercel project
`vantarco/stack-app`, building from `main` of this repo.

```bash
npm install
npm run dev
```

Your routine and every logged day back up to a **STACK APP** folder in Google
Drive as a single JSON file — connect it in Settings. Devices merge rather than
overwrite. See CLAUDE.md → "Drive sync" for the OAuth setup and the one scope
trap worth knowing about.

- **[CLAUDE.md](CLAUDE.md)** — project knowledge: the domain, the architecture,
  the bugs not to reintroduce. Read this first.
- **[MIGRATION.md](MIGRATION.md)** — moving your history off the old GitHub
  Pages build.
- `node verify.mjs` — domain and routine-engine assertions (day classification,
  task-id contract, scheduling, derived reminders, backup validation, local date
  keys, week maths).

Ship with:

```bash
npm run ship
```

That bumps the version, commits it and pushes; Vercel builds from the push.
Every ship bumps the minor — `2.0 → 2.1 → … → 2.9 → 2.10` (which comes *after*
2.9; semver fields are integers, not decimals). It's a script rather than
`npm run deploy && git push` because the dev machine runs Windows PowerShell
5.1, which has no `&&` — npm runs scripts through `cmd.exe`, which does.

Distribution is the Vercel URL only. Not installable, no Play Store wrapper —
both were retired. The service worker stays because notifications fire through
its registration, not because anything is installed.
