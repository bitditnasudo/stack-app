# CLAUDE.md — STACK

Read this before touching anything. It is the migrated knowledge of the project,
written for a fresh Claude Code session with no prior context.

---

## What this is

**STACK** is a single-user daily protocol tracker: skincare, supplements and
training, as a checklist that rebuilds itself for whatever kind of day it is.
It has exactly one user (Arath), runs on his phone as an installed PWA, and has
no accounts, no server and no network calls.

**This repo is a rewrite.** The previous version was a single 1803-line
`index.html` with inline `<style>` and `<script>`, deployed to GitHub Pages and
wrapped as an APK via PWABuilder. That file is still in the parent directory
(`../index.html`, `../sw.js`) as the reference implementation. It is the source
of truth for *behaviour*; this repo is the source of truth for *code*.

**Stack now:** React 18 + Vite 5 + react-router-dom 6 + lucide-react, deployed
on Vercel. No CSS framework, no component library, no state library.

---

## The design system — read this before writing any UI

This app is built on the **Vantarco UI template**, a shared design system that
lives at `../../VANTARCO APP DATABASE/`. Two documents there are binding:

- `DESIGN-SYSTEM.md` — the whole design language and, more usefully, *why* each
  rule exists. Most rules are there because a bug taught them.
- `template/README.md` — house rules and the deploy/version-stamp mechanics.

**Read both before changing anything visual.** The short version:

| Rule | Meaning |
|---|---|
| `theme.css` is the only stylesheet edited per app | STACK edits **only** this file — the WINE token set, see "Theme" below |
| `index.css` never hardcodes a colour, size, radius or shadow | Add a token instead. This is what makes a theme swap a one-file change |
| Needs a visual the kit lacks? **Add it to the kit** | New component in `UI.jsx`, its CSS in `index.css`. Never an inline style — that's how the source apps ended up with 14 font sizes |
| Semantic names, never colour names | `tag-danger`, not `tag-red` |
| Variants compound, states are prefixed | `.btn-soft`, `.tag-ok` / `.is-active`, `.is-done` |
| 44px minimum tap target | Including on things that only *look* small |
| 16px form controls | Anything smaller makes iOS Safari zoom on focus and never zoom back |
| Comment the *why*, especially for a rule that exists because of a bug | The most valuable thing in the repo |

### Theme

STACK runs the Vantarco kit on its own **WINE** theme: light, rose page, wine
brand ramp, Sora + Inter. `src/theme.css` is the *only* file that differs from
the template in colour, and it differs in values only — every token name and
every scale (shape, space, type, motion) is the kit's, unchanged. Nothing
outside that file knows what colour this app is; that is what makes the next
re-skin a one-file change.

```
--brand      #A31D3F   wine     nav pill, primary button, focus ring, ring value
--brand-soft #C9455F   rosé     light end of the primary gradient
--brand-deep #6E1029   deep     dark end, chip ink, and the shadow tint
--bg → --bg-2  #F8EFF1 → #F3E6E9   rose page, deepening downward
```

**The one trap in a red-branded app: brand red vs danger red.** They are kept in
different hue families — brand is a blue-leaning wine (348°), danger a
vermillion (12°) — *and* at different luminance, 1.87:1 apart, so they stay
distinct at chip size and to a red-deficient eye. Never substitute one for the
other, and never add a "red" that is neither.

Two knock-on adjustments, both measured, both commented in the file:

- **`--ok` is darkened to `#00875A`.** The completed task-ring is the one place
  a status colour is a *fill under a white glyph* rather than ink on a wash; the
  template's `#00A86B` put that tick at 2.6:1. It now measures 4.55:1.
- **The greys are warm.** A slate grey on a rose page reads as dirty rather than
  neutral. All three re-measured: `--muted` 6.79:1 on surface, `--muted-2`
  5.80:1, `--muted-on-bg` 7.18:1 on `--bg` and 6.68:1 on `--bg-2`.

`--bg-2` doubles as the sheet background, so it is the *deep* end of the page
gradient, not the light one — a near-white `--bg-2` makes a sheet and the cards
inside it the same colour.

If the theme changes again: re-measure the three greys, `--on-brand` on
`--brand`, every `-ink` on its `-wash`, and white on `--ok`. A tone that passes
on one page tint routinely fails on another — that is the most repeated bug in
this family.

The old app was dark (`#080808` page, `#e8281e` red, Syne + DM Mono). The dark
surface stayed dropped — STACK sits in the same product family as the other
Vantarco apps — but the red came back as the brand, tamed into a wine that can
coexist with `--danger`. If dark should ever return it comes back as a complete
dark token set in `theme.css` and nowhere else, with all of the above
re-measured, because these light values fail on dark.

---

## Domain — what the app actually models

All of it lives in **`src/lib/protocol.js`**. That file is the domain; every
screen is presentation over what `buildTasks()` returns.

### The week

| Day | What happens |
|---|---|
| Mon / Wed / Fri | Gym — full-body hypertrophy. Full actives, full supplements. **15 tasks** |
| Sat | Mobility / stretch, 45 min. Full actives, Ablazor + post-workout. **15 tasks** |
| Sun | Active skincare. **No workout, no supplements beyond Tadalafil.** **12 tasks** |
| Tue / Thu | Rest. Barrier-only skincare, flexible supplement timing. **8 tasks** |

### The two flags, and the bug that lives between them

```
active   → retinoid / vitamin C / minoxidil days   Sun Mon Wed Fri Sat
workout  → a gym or mobility session                   Mon Wed Fri Sat
```

**Sunday is active but has no workout.** These are independent. Never derive one
from the other, never collapse them into one "is it a training day" boolean.
This is the single most likely thing to get quietly wrong.

### Task IDs are a storage contract

Completion persists as `{ [taskId]: true }` per day. Renaming an id silently
orphans history — including the history imported from the old GitHub Pages
build. **Add ids freely; never rename or reuse one.** The 15 live ids are
asserted in `verify.mjs`.

### Domain facts worth not re-deriving

- **Ablazor** is Peptan® collagen. Pre-workout timing is the clinically
  meaningful one — it primes connective-tissue synthesis. Don't "simplify" it to
  post-workout alongside the whey.
- **Creatine** needs daily consistency, not precise timing. It's grouped
  post-workout for convenience, not physiology.
- **Whey** is a dietary tool for hitting 1.6–2.2 g/kg, not a mandatory ritual.
- **Retinol and Vitamin C are never layered.** Vitamin C is morning-only,
  retinol is evening-only, and the evening HA carries a 10–15 min bone-dry wait
  before retinol specifically because damp skin increases irritation.
- Gym is 19:30, 60–90 min. Bed at 23:00. Every clock target derives from those.
- Training is **spine-safe**: no free-weight deadlifts, no barbell rows, no
  high-shear lumbar work. Relevant if a workout logger is ever added.
- Planned addition: **NutraBio Growth Peptides** — post-workout on training
  days, consistent time on rest days. Not yet in `buildTasks()`.

---

## Architecture

```
src/
  theme.css              tokens — UNMODIFIED from the template
  index.css              the kit + a marked "STACK ADDITIONS" block at the end
  app.config.jsx         name, STORAGE_KEY, the 4 nav items, brand mark, build stamp
  App.jsx                provider → router → shell → routes
  main.jsx               entry; service worker registration; LOCK_PINCH_ZOOM=false
  components/
    AppShell.jsx         nav (pill bar ⇄ sidebar) + PageHeader — template, unchanged
    UI.jsx               the kit + STACK additions: MetaPill TaskRow Ring Heatmap
    Signature.jsx        footer mark — template, unchanged
  lib/
    protocol.js          ★ THE DOMAIN — days, tasks, blocks, notification schedule
    dates.js             local date keys, Monday-first weeks. Never UTC
    weeks.js             day logs → a week + its stats
    store.jsx            state, persistence, legacy import, backup, useTodayKey
    notifications.js     permission + in-page scheduling
    useToday.js          the one derivation of "today's list and today's score"
  pages/
    Today.jsx            the checklist
    Overview.jsx         ring, supplements vs skincare split, this week
    Recap.jsx            any week, navigable backwards
    Settings.jsx         reminders, backup/restore, erase, build stamp
verify.mjs               domain assertions — `node verify.mjs`
```

### Navigation is four tabs, and four is the ceiling

`Today · Overview · Recap · Settings`. At four the nav bar marks itself dense:
inactive tabs drop to icons, the active tab keeps its label inside its pill.
Five would overflow. The old app's separate "Notify" page was a permission
button plus a read-only schedule — settings content wearing a tab — so it was
folded into Settings.

There is **no FAB**. STACK has no create verb; its records are generated from
the protocol, not entered by hand.

### State model

One localStorage key, `stack:v1`. Day logs are stored as the template's `items`
array with `id` = the local date key:

```js
{ id: '2026-08-10', checked: { taskId: true }, total: 15, updatedAt, createdAt }
```

That choice is deliberate: it means the template's conflict-safe `mergeStates`
(union by id, newest `updatedAt` wins, tombstones survive) is *already* the
correct merge for this app, and cloud sync later needs only a transport.

- `checked` stores **only true values** — the old writer stored `false` too.
- `total` is **stored, not recomputed**. If the protocol gains a step, a day
  logged as 9/9 must keep reading 100%; recomputing the denominator would
  rewrite history to 9/10.
- `pct === null` means **no data** (day never opened). That is not 0% (opened,
  nothing ticked). The old app conflated them, so every pre-install day showed
  as a failure and the weekly average was meaningless.

---

## Bugs carried forward from the old build — do not reintroduce

1. **UTC date keys.** The old app keyed days with `toISOString()`. At a negative
   UTC offset, between local midnight and UTC midnight the key pointed at
   *tomorrow*: the evening checklist appeared already reset. **Every date key
   goes through `getLocalDateKey()` in `src/lib/dates.js`. There is no other
   legal way to format one.**

2. **No midnight rollover.** The date was read once at load, so a phone left
   open overnight showed yesterday's ticks as today's. The old patch was a full
   `window.location.reload()` on focus. `useTodayKey()` replaces it: re-checks
   on focus *and* arms a timer for the next local midnight, without dropping
   state.

3. **The service worker cache ritual.** The old `sw.js` was cache-first over a
   fixed asset list under a hand-bumped `stack-v2` name — every deploy required
   editing that string, and forgetting left the installed PWA serving stale HTML
   with no way to tell from the phone. **Gone.** `public/sw.js` is network-first
   for navigations (index.html must never be stale — it carries the hashed
   bundle URL) and cache-first for `/assets/*` (Vite fingerprints them, so a URL
   is immutable by construction). The cache name is stamped at build time by the
   `stampServiceWorker` plugin in `vite.config.js`. Nothing to remember.

4. **Apostrophes in single-quoted JS strings.** A recurring fatal syntax error in
   the old single-file build. Non-issue now — JSX and a real build step — but it
   is why UI copy uses `&rsquo;` in a couple of places.

5. **Rows that weren't buttons.** Task cards were `<div onclick>`: not
   keyboard-reachable, no pressed state. `<TaskRow>` is a real `<button>` with
   `aria-pressed`.

6. **Viewport lockdown.** The old head had `maximum-scale=1, user-scalable=no`.
   iOS ignores it; Android treats it as an accessibility regression. Removed.

---

## Known limitations — stated, not hidden

**Notifications only fire while the app is open or backgrounded.** They are
`setTimeout` timers in the page, handed to the service worker registration when
they fire. A closed or evicted app fires nothing. This is the same limitation
the old build had, except the Settings page now *says so* instead of implying
reliability the code doesn't have.

Real fixes, neither in scope: the Notification Triggers API (Chromium-only,
behind a flag) or a push service with a server. Do not claim this is fixed
without one of them.

---

## Data migration — the origin problem

localStorage is scoped to an **origin**. Moving from `*.github.io` to Vercel is
an origin change, so **the phone's history does not follow**. Two paths, both
already built:

- **Same origin** (old app still installed at the old URL): `store.jsx` scrapes
  the legacy `stack_checked_YYYY-MM-DD` / `stack_total_*` keys on first load and
  folds them in once, then latches `settings.legacyImported`.
- **Different origin**: export from the old build with the snippet in
  `MIGRATION.md`, then Settings → Restore from backup. The importer accepts both
  a STACK backup blob and a raw legacy dump, and **merges rather than replaces**
  — importing twice is harmless.

---

## Deploy

**Live at <https://stack-app-flame-phi.vercel.app>.** Vercel project
`vantarco/stack-app`, git-connected to `github.com/bitditnasudo/stack-app` and
building `main` on every push. Vite is auto-detected: `vite build` → `dist`, no
build settings configured by hand.

That repo is the *same* repo the old single-file PWA lived in. Its history was
not discarded — the Vite tree arrived as a `-s ours` merge with the old `main`
as a parent, so `git show ee1710d:index.html` still returns the old app. Nothing
was force-pushed. If you ever need the reference implementation and the copy in
`../index.html` is gone, that is where it is.

```bash
npm install
npm run dev        # local
npm run build      # production build
npm run ship       # bump the counter, commit it, push — the whole ritual
```

`ship` exists because the obvious `npm run deploy && git push` is a trap on this
machine: the dev shell is **Windows PowerShell 5.1, which has no `&&`** and
fails to parse the line before running any of it. npm runs its scripts through
`cmd.exe` on Windows, where `&&` is fine, so putting the chain inside a script
makes it work from PowerShell, cmd and bash alike. `npm run deploy` on its own
still bumps and commits without pushing.

The Settings footer prints `v2.0.0 · deploy #N · N commits · sha · built date`.
Always ship through `ship` so the counter stays honest — a plain `git push`
deploys a build whose footer claims the previous deploy number. The counter has
to be incremented locally because a Vercel build is a throwaway container with
nowhere to write it back to. See `../../VANTARCO APP DATABASE/template/README.md`
for the full mechanics.

`vercel.json` carries the SPA rewrite and the CSP. **`connect-src 'self'` will
block any third-party API call** — add the specific origin rather than widening
it. STACK makes none today.

### The APK is dropped — decided, not pending

The old Play Store artefacts (`../STACK - Google Play package/`) point at the
GitHub Pages origin and are **dead**. STACK ships as an installed PWA from
Vercel and nothing else. Do not re-wrap it, do not update `assetlinks.json`, do
not treat that directory as work-in-progress — the user closed this in Aug 2026.

The practical consequence: "install" means Add to Home Screen from the Vercel
URL, so there is no Play Store update channel and no review lag. A deploy is
live the moment the service worker picks it up. That is the *reason* `sw.js` is
network-first for navigations — with no store build to fall back on, a stale
cached `index.html` would be the only copy of the app on the phone.

---

## Working on this

- **Verify before you claim.** `node verify.mjs` asserts the day
  classification, the task-id contract, local date keys, Monday-first weeks and
  the no-data-vs-0% distinction. Extend it when you add domain rules.
- **`npm run build` must be clean.** It was at the time of writing.
- Check 375px and 1280px: the nav switches pill ⇄ sidebar, sheets centre and
  lock scroll, nothing overflows horizontally, tap targets stay ≥44px.
- The user is a beginner with git, GitHub and deploy infrastructure, and prefers
  numbered steps with a short explanation of *why* a step exists. He wants blunt,
  fact-first answers and sources for claims — don't soften and don't pad.

### On the horizon

Nutrition tracker, workout logger, supplement inventory. All would be separate
Vantarco apps rather than tabs here — five tabs is over the kit's limit, and
these are different jobs.
