/* ============================================================================
   PROTOCOL — the seed routine. What a fresh install starts with.
   ============================================================================
   This used to be the domain: a `buildTasks(active, workout)` function with the
   whole protocol hardcoded in it, and two literal day-classification tables
   beside it. The routine is now DATA the user edits (see `routine.js` for the
   schema and the engine), and this file is only what that data starts as.

   WHY THE IDS BELOW ARE FROZEN
   Completion is persisted as `{ [taskId]: true }` per day, going back to the
   original GitHub Pages build. These fifteen ids are the ones that history is
   keyed by, so the seed reproduces them EXACTLY — a rename here would orphan
   every tick ever recorded. `verify.mjs` asserts the set. New tasks the user
   adds get minted ids from `newId()`; nothing ever rewrites an existing one.

   WHAT THE SEED ENCODES (the original week, unchanged)
     Mon / Wed / Fri  gym + full actives + full supps      15 tasks
     Sat              mobility + full actives + supps      15 tasks
     Sun              active skincare, no workout          12 tasks
     Tue / Thu        rest: barrier-only skincare           8 tasks

   Expressed as four overlapping day types — Gym, Mobility, Active, Rest — plus
   "Every day". Sunday being ACTIVE WITH NO WORKOUT is why day types overlap
   instead of being an enum; that note lives in full at the top of `routine.js`.

   Editing this file changes what a NEW install starts with and what "Reset to
   the starting routine" restores. It does not touch a routine already saved on
   a device — that one is the user's now.
   ========================================================================== */

/* JS day index: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat */
const SEED = {
  version: 1,

  /* Order is priority order: the first type matching today wins the badge on
     Today and Recap. Gym above Active is what makes a Monday read GYM. */
  dayTypes: [
    { id: 'gym',      name: 'Gym',       tone: 'brand',   days: [1, 3, 5] },
    { id: 'mobility', name: 'Mobility',  tone: 'info',    days: [6] },
    { id: 'active',   name: 'Active',    tone: 'warn',    days: [0, 1, 3, 5, 6] },
    { id: 'rest',     name: 'Rest',      tone: 'neutral', days: [2, 4] },
    /* Covers all seven, so it never shows as a badge — it exists to schedule
       the steps that happen regardless of what kind of day it is. */
    { id: 'everyday', name: 'Every day', tone: 'neutral', days: [0, 1, 2, 3, 4, 5, 6] },
  ],

  /* The four categories worth splitting the day by. Health and Habits start
     empty on purpose: they are there to be filled, not to be decoration. */
  tags: [
    { id: 'skin',   label: 'Skincare',    tone: 'info' },
    { id: 'supp',   label: 'Supplements', tone: 'brand' },
    { id: 'health', label: 'Health',      tone: 'ok' },
    { id: 'habit',  label: 'Habits',      tone: 'warn' },
  ],

  /* Times are 24h "HH:MM" and render through the locale. `remind` is minutes
     before `start`; null silences the block. The reminder schedule is derived
     from these — there is no second list to keep in step. */
  blocks: [
    { id: 'morning',     label: 'Morning Skincare', start: '06:30', end: '07:00', remind: 10 },
    { id: 'afternoon',   label: 'Afternoon',        start: '17:00', end: '18:00', remind: 10 },
    { id: 'preworkout',  label: 'Pre-Workout',      start: '18:30', end: '19:00', remind: 10 },
    { id: 'postworkout', label: 'Post-Workout',     start: '21:00', end: '21:30', remind: 5 },
    { id: 'evening',     label: 'Evening Skincare', start: '22:00', end: '22:30', remind: 10 },
  ],

  tasks: [
    /* ── Morning skincare ─────────────────────────────────────────────────── */
    {
      id: 'sk_am_cleanse', block: 'morning', tags: ['skin'], dayTypes: ['everyday'], days: [],
      name: 'LUMACA Cleanser',
      detail: 'Cleanse and pat completely dry before next step',
      target: '', warn: '', wait: '',
    },
    {
      id: 'sk_am_growth', block: 'morning', tags: ['skin'], dayTypes: ['active'], days: [],
      name: 'Growth Serum (Minoxidil / Torongia)',
      detail: 'Apply to dry skin',
      wait: 'Wait 5–10 min before next step',
      target: '', warn: '',
    },
    {
      id: 'sk_am_vitc', block: 'morning', tags: ['skin'], dayTypes: ['active'], days: [],
      name: 'Vitamin C (Babaria)',
      detail: 'Apply Babaria Vitamin C',
      wait: 'Wait 2–3 min before next step',
      target: '', warn: '',
    },
    {
      id: 'sk_am_ha', block: 'morning', tags: ['skin'], dayTypes: ['everyday'], days: [],
      name: 'Hyaluronic Acid (Babaria)',
      detail: 'Mist face with water first, then apply HA to damp skin',
      wait: 'Wait 1 min before next step',
      target: '', warn: '',
    },
    {
      id: 'sk_am_lub', block: 'morning', tags: ['skin'], dayTypes: ['everyday'], days: [],
      name: 'Lubriderm Men 3-in-1',
      detail: 'Moisturize — lock in the hydration',
      target: '', warn: '', wait: '',
    },
    {
      id: 'sk_am_spf', block: 'morning', tags: ['skin'], dayTypes: ['everyday'], days: [],
      name: 'ISDIN Sunscreen',
      detail: 'Last step — every single day without exception',
      target: '', warn: '', wait: '',
    },

    /* ── Afternoon ────────────────────────────────────────────────────────── */
    {
      /* The detail used to switch on whether it was a gym day. Static data
         can't branch, so it states both cases — which is also less to read at
         5pm than a sentence that changes shape day to day. */
      id: 'tadalafil', block: 'afternoon', tags: ['supp'], dayTypes: ['everyday'], days: [],
      name: 'Tadalafil',
      detail: 'As prescribed — mid-afternoon, or before the gym on training days',
      target: '~5:00–6:00 PM',
      warn: '', wait: '',
    },

    /* ── Pre-workout ──────────────────────────────────────────────────────── */
    {
      /* Peptan® collagen: pre-workout timing is the clinically meaningful one —
         it primes connective-tissue synthesis. Don't "simplify" it to post. */
      id: 'ablazor', block: 'preworkout', tags: ['supp'], dayTypes: ['gym', 'mobility'], days: [],
      name: 'Ablazor',
      detail: '10g sachet — 30–60 min before gym',
      target: '6:30–7:00 PM (gym at 7:30 PM)',
      warn: '', wait: '',
    },

    /* ── Post-workout ─────────────────────────────────────────────────────── */
    {
      id: 'whey', block: 'postworkout', tags: ['supp'], dayTypes: ['gym', 'mobility'], days: [],
      name: 'Whey Protein',
      detail: '25–40g within 30–60 min after training',
      target: '~9:00–9:30 PM',
      warn: '', wait: '',
    },
    {
      /* Grouped here for convenience, not physiology: creatine needs daily
         consistency, not precise timing. */
      id: 'creatine', block: 'postworkout', tags: ['supp'], dayTypes: ['gym', 'mobility'], days: [],
      name: 'Creatine',
      detail: '3–5g — take right after workout',
      target: '~9:00–9:30 PM',
      warn: '', wait: '',
    },

    /* ── Evening skincare ─────────────────────────────────────────────────── */
    {
      id: 'sk_pm_cleanse', block: 'evening', tags: ['skin'], dayTypes: ['everyday'], days: [],
      name: 'LUMACA Cleanser',
      detail: 'Cleanse — leave skin slightly damp for next step',
      target: 'Start 10:00–10:30 PM',
      warn: '', wait: '',
    },
    {
      /* The bone-dry wait used to hang off this step and appear only on active
         nights. A task's fields no longer branch, so the instruction moved down
         onto Retinol — the step it actually protects — where it shows on
         exactly the nights it applies and nowhere else. */
      id: 'sk_pm_ha', block: 'evening', tags: ['skin'], dayTypes: ['everyday'], days: [],
      name: 'Hyaluronic Acid (Babaria)',
      detail: 'Apply to damp skin immediately after cleanse',
      target: '', warn: '', wait: '',
    },
    {
      id: 'sk_pm_retinol', block: 'evening', tags: ['skin'], dayTypes: ['active'], days: [],
      name: 'Retinol (Babaria)',
      detail: 'Only once the HA is fully dry — damp skin increases irritation',
      wait: 'Give the HA 10–15 min to go bone-dry first',
      warn: 'Never layer with Vitamin C',
      target: '',
    },
    {
      id: 'sk_pm_min', block: 'evening', tags: ['skin'], dayTypes: ['active'], days: [],
      name: 'Minoxidil / Torongia',
      detail: 'Apply right after Retinol',
      wait: 'Wait 2–3 min before next step',
      target: '', warn: '',
    },
    {
      id: 'sk_pm_lub', block: 'evening', tags: ['skin'], dayTypes: ['everyday'], days: [],
      name: 'Lubriderm Men 3-in-1',
      detail: 'Final step — seal everything in before sleep',
      target: '', warn: '', wait: '',
    },
  ],
}

/**
 * A fresh, deeply-cloned copy of the seed.
 *
 * Always a copy: the store, the reset button and the import fallback all hand
 * this straight into state, and React state that shares structure with a module
 * constant is one careless mutation away from a "default" routine that has
 * quietly picked up the user's edits — and then reseeds a wiped device wrong.
 */
export function defaultRoutine() {
  return structuredClone(SEED)
}
