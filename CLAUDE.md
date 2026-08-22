# CLAUDE.md — STACK

Read this before touching anything. It is the migrated knowledge of the project,
written for a fresh Claude Code session with no prior context.

---

## What this is

**STACK** is a single-user daily protocol tracker: skincare, supplements,
health and habits, as a checklist that rebuilds itself for whatever kind of day
it is. It has exactly one user (Arath), runs as a page on Vercel, and has no
accounts and no server.

**The protocol is editable in the app.** Tasks, the named kinds of day they run
on, the tags they are grouped by and the time blocks they sit in are all user
data now — see "Domain" below. Adding a supplement is no longer a code change.

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

STACK runs the Vantarco kit on **WINE AFTER DARK**: near-black page, a wine ramp
lifted to a rose bright enough to carry on it, Sora + Inter. `src/theme.css` is
still the *only* file that differs from the template in colour, and it still
differs in values only — every token name and every scale is the kit's.

**The app is dark-only.** There is no light mode and no `prefers-color-scheme`
switch. The light WINE set it replaced is preserved whole at the bottom of
`theme.css` as REFERENCE THEME C, so reverting is a comment swap rather than an
excavation.

```
--brand      #FF4D6D   rose      primary button, focus ring, progress, ring value
--brand-soft #FF7D93   light     light end of the primary gradient
--brand-deep #FFB3C0   palest    pill fills, AND the ink on --brand-wash
--bg → --bg-2  #131011 → #171314   near-black page, lifting downward
```

**Read a token as a ROLE, not as a colour, or this file looks upside-down.** On
dark, several tokens invert in lightness and the names stay put — that is the
whole point of the kit:

- **`--brand-deep` is the LIGHTEST brand step here.** Its job is "the ramp end
  that carries `--on-brand`, and the ink on `--brand-wash`". On a white page
  that job wants a dark wine; on a black page it wants a pale rose. Renaming it
  would break the one rule that makes a component read the same token in every
  theme.
- **`--on-dark` is near-black.** Its job is "ink on a saturated or inverted
  fill", and on this theme those fills are all bright: the tick inside a
  completed task ring (`--ok`), the toast (`--text` as a background), and the
  hero card's brand gradient.

**Brand red vs danger red, again and harder.** On black *both* have to be bright
to exist at all, so the luminance gap the light theme leaned on is much harder
to hold. `--danger` measures **1.43:1** against `--brand` — less than the light
theme's 1.87:1, and that is the honest number. The shortfall is made up with
hue: danger is pushed to ~22° (from 12°) against the brand's ~350°. Never
substitute one for the other, and never add a "red" that is neither.

Three knock-on changes, all measured, all commented in the file:

- **`--ok` is a lime `#4ADE80`**, not the light theme's forest `#00875A`, which
  measures 1.9:1 on this page. It is the one status that appears as a *fill
  under a glyph*, so it is the one that has to be bright — `--on-dark` on it
  measures 10.75:1.
- **Shadows are black, not brand-tinted.** The kit's rule ("brand-tinted, never
  grey — a grey shadow under a tinted page reads as dirt") assumes a light page.
  With `--brand-rgb` bright, that same rule paints a pink *glow* under every
  card. `--shadow-brand` keeps the tint, because that one is a glow on purpose.
- **The radius scale opened to 28 / 18 / 12** from the kit's 22 / 14 / 10. 28 is
  a deliberate ceiling: past ~32px a `--radius-sm` button inside a `--radius`
  card starts to look like it is escaping the corner, and the heat cells turn
  into circles.

**Three tokens were added, and they are gaps the kit only reveals once someone
writes a dark theme for it.** All three are candidates to promote into the
shared template:

| Token | Why it had to exist |
|---|---|
| `--on-dark-muted` | `index.css` hardcoded `rgb(255 255 255 / .78)` for the hero card's secondary line — the last colour literal in the kit, and invisible as a bug until a theme made that card bright |
| `--on-dark-veil` | the fill behind `.tag-on-dark`. A white veil on a *bright* card leaves the chip invisible; which direction it goes is the theme's call, not `index.css`'s |
| `--heat-ink` | the heatmap ramp used to switch inks halfway up (`--brand-deep` → `--on-brand`). That crossover is theme-specific and lands on a different step on dark, so the ramp went illegible in the middle. The top alpha also drops .80 → .72, which is what lets one ink clear AA across all five steps |

**Every number above is measured.** All 47 pairings the app actually renders
were checked with the WCAG formula against *these* surfaces, including the
alpha-composited ones (a heat cell is brand at an alpha over `--surface`, so the
ratio depends on both). If the theme changes again, re-measure all of it — a
tone that passes on a rose page fails on a black one, which is the most repeated
bug in this family.

`#131011` also appears in `index.html` as `theme-color`, which is what tints
Android Chrome's address bar. Keep the two in step. (There is no manifest to
keep in step any more — see "Not a PWA".)

---

## Domain — what the app actually models (SCHEMA v2)

**The protocol is DATA the user edits, not code.** Two files, and the split
matters:

- **`src/lib/routine.js`** — the schema and the engine, all pure. Read its
  header before touching the model.
- **`src/lib/protocol.js`** — the *seed* only. What a fresh install starts with
  and what "Reset routine" restores; editing it never touches a saved routine.

### The document

```js
routine = {
  version: 2,
  categories: [{ id, label, color }],    // workout · supplement · skincare · leisure
  habits:     [{ id, name, detail, time, categoryId, remind, warn }],
  templates:  [{ id, title, color, steps: [Step] }],
  week:       [t0 … t6],                 // weekday → template id (or null)
}

Step = { id, kind:'habit', habitId } | { id, kind:'wait', minutes, note }
```

### Three ideas, deliberately separate

1. **A HABIT is a thing you do** — name, category, and the time of day it
   belongs at. It knows nothing about which days it runs. That is what makes it
   reusable: "Creatine" is one habit whether it appears on three days or seven.
   **It does not store its days** — `habitDays()` derives them from the week.
   Storing them would duplicate the templates and drift.

2. **A TEMPLATE is a named day** — a mood, a colour, and an ORDERED list of
   steps. **Waits are steps in that list**, not a field on the habit before the
   gap. v1 modelled a wait as text on the preceding task, which meant it could
   never sit between two habits without belonging to one of them.

3. **THE WEEK is seven slots**, each pointing at a template. Mon/Wed/Fri sharing
   one "Gym" is the entire reason templates exist — build once, edit once. Two
   days that must differ need two templates. **There are no per-day overrides**;
   that was considered and rejected as the place this kind of model gets
   confusing.

### What v1 was, and the rule that did NOT survive

v1 scheduled by **overlapping day types** — a task named "active" and "gym", and
a weekday matched as many as applied. That existed to express *Sunday is active
but has no workout*: two independent flags that could not be collapsed into one
enum, and the single most bug-prone thing in the file.

**v2 has no flags to collapse.** A Sunday is just a template whose steps are the
ones Sunday has. The constraint is gone rather than solved — so the old warning
about never deriving one flag from the other no longer applies to anything.

### THE CONTRACT THAT DID SURVIVE — habit ids

Completion persists as `{ [habitId]: true }` per day, going back to the GitHub
Pages build. **`habit.id` is the same string `task.id` was.** The seed
reproduces the original fifteen exactly and `migrateV1()` carries every id
across unchanged. `verify.mjs` asserts both, and asserts that no id referenced by
history fails to resolve. **Never rename or reuse one.**

### The v1 → v2 migration

Lives at the bottom of `routine.js`. v1 scheduled by overlapping day types, v2 by
one template per weekday, so it works forward from the only thing both agree on:
**what each of the seven weekdays actually contained.** It replays v1's rules per
weekday, then folds weekdays with identical step lists into one shared template —
which is exactly how Mon/Wed/Fri arrive as a single "Gym" rather than three
copies. Templates take their name from the v1 day type that best described the
day, so the week still reads familiar.

v1's free-text `wait` ("Wait 5–10 min before next step") becomes a real wait step
after its habit, with the first integer in the string as its length.

Verified against a real v1 blob with logged history: **zero orphaned ids, day
totals untouched, Mon/Wed/Fri folded, waits converted.**

### Derived, not hand-maintained

- **The day badge** is simply the template's title and colour.
- **Reminders** come from `notifScheduleFor()` — each habit with a time and a
  `remind` fires that many minutes before, on exactly the weekdays its templates
  cover. **Habits sharing a fire time merge into ONE notification**: three
  separate buzzes at 06:20 is three chances to dismiss the whole morning. Do not
  reintroduce a hand-kept reminder list.
- **The Overview split** is one bar per category with a step today.
- **Waits are not achievements.** A day's steps include them; its SCORE counts
  only habit steps. Folding waits into the denominator would make a day with
  four gaps score lower than the same day with none.

### Things an edit must not break — all asserted

`normaliseRoutine()` is the one place a routine is made sound and it runs on
**every load**, not just on import.

- deleting a **habit** pulls it out of every template that used it;
- deleting a **category** re-homes its habits onto the first survivor; the last
  category cannot be deleted;
- deleting a **template** frees the weekdays that ran it — those days read
  "OPEN", which is not an error;
- **step ids are unique PER TEMPLATE, not globally.** This one bit hard: the
  seed used `s_<habitId>`, so the same habit in Gym/Active/Rest collided, and a
  global dedupe in `normaliseRoutine` silently deleted 12 of Active's 17 steps
  on load. A step is addressed as (template, step); scope the dedupe that way.

### Domain facts worth not re-deriving

- **Ablazor** is Peptan® collagen. Pre-workout timing is the clinically
  meaningful one — it primes connective-tissue synthesis. Don't "simplify" it to
  post-workout alongside the whey.
- **Creatine** needs daily consistency, not precise timing.
- **Whey** is a dietary tool for hitting 1.6–2.2 g/kg, not a mandatory ritual.
- **Retinol and Vitamin C are never layered.** Vitamin C is morning-only,
  retinol evening-only, and the 10–15 min bone-dry gap before retinol is now a
  real wait step in the sequence rather than a note on the step before it.
- Gym is 19:30, 60–90 min. Bed at 23:00.
- Training is **spine-safe**: no free-weight deadlifts, no barbell rows, no
  high-shear lumbar work.

---

## First run

`/welcome`, three screens: what STACK is → connect Google Drive → build your
week (start from the example week, start empty, or skip straight in).

**`settings.onboardingDone` DEFAULTS TRUE.** That is what stops every existing
device seeing the flow on upgrade — saved state spreads over the default and
keeps `true`. Only `loadLocal` finding *no saved blob at all* flips it false, so
the gate is invisible to anyone already using the app.

**Sign-in is prominent but skippable, deliberately.** A failed OAuth, a wrong
Google account or no signal would otherwise make the app unusable, and STACK
works completely offline. `OnboardingGate` in `App.jsx` never blocks
`/auth/callback` — the OAuth round trip happens mid-onboarding and bouncing it
back would drop the token before it was stored.

---

## Architecture

```
src/
  theme.css              tokens — the WINE AFTER DARK set + 3 reference themes
  index.css              the kit + marked "STACK ADDITIONS" blocks at the end
  app.config.jsx         name, STORAGE_KEY, nav items, brand mark, build stamp
  App.jsx                provider → router → onboarding gate → shell → routes
  main.jsx               entry; service worker registration
  components/
    AppShell.jsx         nav (pill bar ⇄ sidebar) + PageHeader — template
    UI.jsx               the kit + STACK: StepCard WaitCard Ring Heatmap,
                         DayPicker ColorPicker EditRow
    Signature.jsx        footer mark — template, unchanged
  lib/
    routine.js           ★ THE ENGINE — v2 schema, sequencing, reminders,
                         validation, and the v1→v2 migration
    protocol.js          the SEED routine, plus blankRoutine() for first run
    colorUtils.js        readable ink on a runtime colour (category fills)
    dates.js             local date keys, Monday-first weeks. Never UTC
    weeks.js             day logs → a week + its stats
    store.jsx            state, persistence, Drive sync, backup, useTodayKey
    googleDrive.js       OAuth + Drive file (ported from the Plant Tracker)
    notifications.js     permission + in-page scheduling (schedule passed IN)
    useToday.js          the one derivation of today's sequence and score
  pages/
    Onboarding.jsx       ★ first run — welcome, Drive, build your week
    Today.jsx            the day as a flat coloured sequence
    Overview.jsx         ring, by-category split, this week
    Recap.jsx            any week, navigable backwards
    Routine.jsx          ★ the editor — Week / Habits / Categories
    Settings.jsx         routine link, reminders, Drive, backup, erase, stamp
    AuthCallback.jsx     where Google drops the token
verify.mjs               100 domain + engine + migration assertions
```

### Navigation is four tabs, and four is the ceiling

`Today · Overview · Recap · Settings`. At four the nav bar marks itself dense:
inactive tabs drop to icons, the active tab keeps its label inside its pill.
Five would overflow. The old app's separate "Notify" page was a permission
button plus a read-only schedule — settings content wearing a tab — so it was
folded into Settings.

There is **no FAB** — but the reason changed. STACK *gained* a create verb when
the protocol became editable; it just belongs to one screen rather than to the
shell. A global "+" on the checklist would sit beside fifteen things that are
ticked, not created, and its meaning would change from tab to tab. `Routine`
carries its own add buttons, in the section the thing belongs to — including
the two inside a day, "Step" and "Wait", which is where you are when you want
them.

**`/routine` is a sub-page, not a fifth tab** — the bar is full at four. It is
reached from the sliders icon on Today (where you notice a step is missing) and
from the top of Settings (where you go looking for it).

Two density rules came out of a critique pass in v2.2, both measured:

- **The editor stays SHORTER than the screen it edits.** Routine/Tasks was
  2494px against Today's 2280px, because each row repeated the task's detail
  line. Dropping it took the tab to 1900px. The detail says what a task *does*,
  which is what you want on Today and noise when you are scanning fifteen rows
  for the one to change; it is still one tap away in the sheet. Duplicate names
  (two "LUMACA Cleanser") stay tellable apart because the block heading above
  them is the disambiguator.
- **A global action never renders inside tab content.** "Reset routine" used to
  be a danger card at the foot of all four tabs, which put one destructive
  control at four different scroll positions — y=655 on Tags, y=2215 on Tasks.
  It is now a single icon in the PageHeader, same glyph and same corner as
  Today's "reset the checklist".

### State model

One localStorage key, `stack:v1`, holding **both** the day logs and the routine.
Day logs are stored as the template's `items` array with `id` = the local date
key:

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

Alongside `items` sit `routine` and `routineUpdatedAt`. The routine is a single
DOCUMENT, not a set, so it cannot use the union merge — two edited checklists
have no meaningful union and half-applying one produces a list neither device
ever had. It resolves by **last write wins**, the same rule `settings` and
`profile` already used, in both `mergeStates` and backup import. `importBackup`
returns `{ days, routine }` so the UI can say which happened: gaining a few days
of history and having your whole checklist replaced are very different events
and neither should be silent.

The routine is seeded in `loadLocal()`, not in an effect — the first render
already needs a checklist to build, and an effect would mean one frame of "no
protocol" plus a null branch in every consumer that is never exercised. A device
upgrading from the pre-editor build has no `routine` key, falls through to the
seed, and sees exactly the protocol it was already showing: same ids, same days,
history still lines up.

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
   editing that string, and forgetting left the app serving stale HTML with no
   way to tell from the phone. **Gone.** `public/sw.js` is network-first
   for navigations (index.html must never be stale — it carries the hashed
   bundle URL) and cache-first for `/assets/*` (Vite fingerprints them, so a URL
   is immutable by construction). The cache name is stamped at build time by the
   `stampServiceWorker` plugin in `vite.config.js` as `<version>-<commit>`, both
   of which change on every ship. Nothing to remember.

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

## Drive sync — where the user data lives

**Ported from the Plant Tracker**, deliberately: `src/lib/googleDrive.js` is the
same OAuth implicit-redirect flow, the same shared Vantarco OAuth client, and
the same one-JSON-file-holds-everything shape as
`PLANT TRACKER/src/lib/googleDrive.js`. If you are changing one, look at the
other first.

Everything the user owns — the routine and every logged day — goes up as a
single `stack-sync.json` in a Drive folder named **STACK APP**.

```
state  ──►  { savedAt, version, state }  ──►  stack-sync.json
```

### Why the merge needed no new code

`mergeStates` was already conflict-safe: day logs union by date key with
newest-`updatedAt`-wins, tombstones survive, and the routine resolves
last-write-wins. That was the entire reason day logs are stored as the
template's `items` array keyed by date. The sync is transport and nothing else.

**Devices MERGE, they do not overwrite.** A phone offline for a week can add the
days it logged but can never delete days it never saw.

### THE SCOPE TRAP — read this before debugging "it made its own folder"

The app asks for **`drive.file`**, the narrowest scope that can write to Drive:
per-file access to files *this app created*. It cannot read anything else in the
Drive it is signed into, which is the right default for a client-side app whose
token sits in `localStorage`.

The catch: **a folder the user made by hand in the Drive UI was not created by
this app**, so `drive.file` may not be able to open it — even with the correct
folder id. Google's sanctioned way to hand a pre-existing folder to a
`drive.file` app is the **Picker**.

`resolveFolder()` therefore does this, and it is not a workaround being hidden:

1. try `VITE_GDRIVE_FOLDER_ID`;
2. on 404/403, find-or-create a folder named `STACK APP` that the app owns;
3. return `{ id, name, pinned }` — and **Settings prints which folder it is
   actually writing to, with a link.** `pinned: false` means the configured
   folder could not be opened. Silently writing somewhere other than where the
   user pointed it would be worse than failing.

If the fallback fires and the pinned folder is genuinely wanted, there are
exactly three options, in order of how much they cost:

| Option | Cost |
|---|---|
| Use the folder STACK created and move on | none — it is the Plant Tracker's own behaviour |
| Add the Google Picker | keeps `drive.file`; needs Google's script, so `script-src` in the CSP has to open up |
| Switch `SCOPES` to `https://www.googleapis.com/auth/drive` | one line, works with the pinned id — but grants read/write over the **entire** Drive to a token in `localStorage` |

The third is a real escalation and should be a deliberate decision, not a
default. It is why the constant is one line with a comment above it.

### Setup that is NOT in the repo

`.env.local` is gitignored, and Vite embeds `VITE_*` into the bundle (fine —
neither value is a secret):

```
VITE_GOOGLE_CLIENT_ID=…   # shared with BUDGET APP and PLANT TRACKER
VITE_GDRIVE_FOLDER_ID=…   # the "STACK APP" folder
```

**The OAuth client's authorised redirect URIs must include this app's origins**,
or sign-in dies with `redirect_uri_mismatch` before it ever reaches the app:

```
http://localhost:5178/auth/callback
https://stack-app-flame-phi.vercel.app/auth/callback
```

`vercel.json`'s CSP was opened by exactly two entries and no more —
`connect-src https://www.googleapis.com` for the API, and `form-action
https://accounts.google.com` for the sign-in redirect.

### Wiring notes worth not rediscovering

- **`/auth/callback` is routed OUTSIDE `AppShell`.** It lives for a few hundred
  milliseconds; flashing the nav bar behind it makes it look like a destination.
  It also clears the URL fragment before navigating — a token in the address bar
  ends up in screenshots and in the back-forward cache.
- **`applying` guards the pull.** Writing merged remote data into state marks the
  device dirty, which pushes straight back — two devices ping-ponging forever.
  The counter suppresses the dirty flag for exactly the renders a pull causes.
- **The dirty effect has its own first-run latch (`dirtyFirstRun`), not
  `hydrated`.** Effects run in declaration order and the save effect flips
  `hydrated` on the same first pass, so the dirty effect read `true` on mount
  and every cold start rewrote the Drive file on open.
- **Sync meta (`stack:sync`) is deliberately outside the synced blob.** It is
  this device's relationship to the file; syncing it would have each device
  overwrite the other's bookkeeping.
- **Disconnect does not delete the file.** It means "stop talking to Drive on
  this device", not "throw away the backup".
- Push is debounced 4s, so ticking off a morning routine is one upload, not
  eight. Pull runs on startup and on every return to the foreground.

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
npm run check      # domain assertions + runtime contrast — both gates
npm run ship       # bump the version, commit it, push — the whole ritual
```

**Run these from `stack-vite/`, not from `STACK APP/`.** The outer folder is a
container — it holds the retired single-file build (`index.html`, `sw.js`) and
the dead Play Store package — and has no project in it. `npm` there fails with
`ENOENT: no such file or directory, open '…/STACK APP/package.json'`, which is
the single most repeated papercut on this machine, because the outer folder is
what an editor session opens in.

There is a **forwarder** at `../package.json` that makes `npm run check`, `dev`,
`build`, `ship` and friends work from the outer folder too — each one just does
`cd stack-vite && npm run <script>`. **It is not in version control**: the git
repo is `stack-vite/`, not its parent, so a fresh clone will not have it and
nothing depends on it. If it is missing, either recreate it or just `cd` first.
Nothing in the build, the deploy or the tests reads it.

`ship` exists because the obvious `npm run deploy && git push` is a trap on this
machine: the dev shell is **Windows PowerShell 5.1, which has no `&&`** and
fails to parse the line before running any of it. npm runs its scripts through
`cmd.exe` on Windows, where `&&` is fine, so putting the chain inside a script
makes it work from PowerShell, cmd and bash alike. `npm run deploy` on its own
still bumps and commits without pushing.

### The version IS the counter

Every ship bumps the **minor**: `2.0 → 2.1 → 2.2 … → 2.9 → 2.10 → 2.11`. It
never rolls into `3.0` on its own — a major is a decision someone makes, not
something that happens because you shipped ten times.

**`2.10` comes after `2.9` and is not `2.1`.** Semver fields are integers, not
decimals. `scripts/bump-deploy.js` compares them as numbers and never as a
float; anything that sorts versions must do the same.

The Settings footer prints `v2.1 · N commits · sha · built date`. The patch
field is dropped when it is `0` (`2.10.0` → `v2.10`), so a real patch release
would still print in full as `v2.1.3`.

There used to be a separate `deploy #N` counter beside the version. It is gone,
along with `buildinfo.deploys` and `__DEPLOY_COUNT__` — two numbers that both
counted deploys meant every reader had to work out which one mattered.

Always ship through `ship`. A plain `git push` deploys a build whose footer
claims the previous version. The bump has to happen locally because a Vercel
build is a throwaway container with nowhere to write it back to. See
`../../VANTARCO APP DATABASE/template/README.md` for the full mechanics — note
STACK's counter now differs from the template's.

`vercel.json` carries the SPA rewrite and the CSP. **The CSP will block any
third-party API call** — add the specific origin rather than widening it. It has
been opened by exactly two entries, both for Drive sync: `connect-src
https://www.googleapis.com` and `form-action https://accounts.google.com`.

### Not a PWA — decided, not pending

**STACK is a web page on Vercel. It is not installable and there is no app
container.** As of v2.1 the manifest, the `apple-mobile-web-app-*` tags and
`public/site.webmanifest` are gone. Do not add them back, do not re-wrap it, and
do not treat `../STACK - Google Play package/` as work-in-progress — those Play
Store artefacts point at the dead GitHub Pages origin, and the whole
install-container idea was closed in Aug 2026.

**The service worker survived, and deleting it will break reminders.** A service
worker is not an install feature. Notifications go out through
`navigator.serviceWorker.ready` → `registration.showNotification()`, because the
plain `new Notification()` constructor is unsupported on Android Chrome and
throws. `public/sw.js` therefore stays registered even in a plain browser tab.
Its caching is now a bonus (fast repeat loads, survivable flaky connection)
rather than the reason it exists.

Two things that also stayed and look like PWA leftovers but are not:

- **`theme-color`** tints Android Chrome's address bar. That is a browser-tab
  feature; it has nothing to do with installing.
- **`icon-192.png`** is referenced by the notifications, not by a home screen.
  (`apple-touch-icon.png` is a genuine leftover, kept only because Safari
  auto-discovers it for bookmarks whether or not a `<link>` points at it.)

---

## Working on this

- **`npm run check`** runs both gates: `verify.mjs` (domain + engine +
  migration) and `scripts/contrast.mjs` (WCAG over every runtime colour). Run it
  before claiming anything.
- **Runtime colour is NOT covered by the theme's measurements.** `theme.css`
  records 47 pairings of the theme's own colours; `.mood`, `.cat-chip`,
  `.week-slot` and `.step-card` colour themselves from user data, and three of
  them shipped broken in v2.3 because they were eyeballed against one palette
  entry instead. `scripts/contrast.mjs` exists to stop that: every palette
  colour, every context. Two rules it encodes —
  **a gradient has two ends** (`--on-dark-muted` passed at 4.72:1 on one stop
  and failed at 4.02:1 on the other), and **when the ink IS the colour, a
  heavier wash costs contrast** (`.mood` at 22% measured 4.49:1; at 14% it is
  5.26:1).
- **A component must not encode a backdrop assumption.** `.mood` inks the day's
  colour onto a wash of itself — 7.56:1 on the page, **1.07:1 on the hero's
  bright gradient**, i.e. invisible. The fix was an explicit `.mood-on-dark`
  variant, which makes the backdrop a decision at the call site. Same class of
  bug as the `--heat-ink` crossover. `--on-dark-veil` LIGHTENS for the same
  reason: the chip carries near-black ink, so darkening it hides the text.
- **Verify before you claim.** `node verify.mjs` runs 100 assertions: the day
  classification, the task-id contract, local date keys, Monday-first weeks, the
  no-data-vs-0% distinction, and the routine engine — the day-type union,
  reorder staying inside its block, the three deletion behaviours, the derived
  reminder times, and `normaliseRoutine` surviving a garbage backup. Extend it
  when you add domain rules.
- **Time formatting is asserted through `Intl`, never against a literal "AM".**
  The first `formatTimeRange` matched `/AM|PM/` and silently did nothing on the
  dev machine, whose locale renders `6:30 a.m.` — every block heading read
  "6:30 a.m. – 7:00 a.m.". It now asks `formatToParts` which characters are the
  day period, which also means a 24-hour locale is left alone.
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

Now that the routine is data, two things get cheaper and are worth knowing about
before someone rebuilds them by hand:

- **Sync** needs only a transport. `mergeStates` already resolves day logs by
  union and the routine by last-write-wins.
- **Sharing or templating a routine** is an export of `state.routine` — the
  importer already accepts and validates one.
