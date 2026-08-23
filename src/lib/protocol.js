/* ============================================================================
   PROTOCOL — the seed routine. What a fresh install starts with.
   ============================================================================
   Only the seed. The schema and every function that reads or rewrites a routine
   live in `routine.js`; editing this file changes what a NEW install begins
   with and what "Reset routine" restores, and touches nothing already saved on
   a device.

   WHY THE HABIT IDS BELOW ARE FROZEN
   Completion is persisted per day, going back to the original GitHub Pages
   build, and it was keyed by habit id for all of that time. These ids are what
   that history is keyed by, so the seed reproduces them EXACTLY and the v1→v3
   migration carries them across unchanged. A rename here orphans every tick
   ever recorded. `verify.mjs` asserts the set.

   WHY THE AM/PM DUPLICATES ARE STILL HERE
   `sk_am_cleanse` and `sk_pm_cleanse` are both "LUMACA Cleanser"; so are the HA
   and Lubriderm pairs. They are not an oversight — they are the workaround for
   v2 being unable to put one habit in a day twice, and they are exactly what
   `dedupeLibrary` merges. They stay in the seed rather than being pre-merged
   here for two reasons: the ids are the frozen storage contract above, and
   leaving them means the dedupe runs on ONE code path for a fresh install and
   an upgrading device alike, instead of two that can disagree.

   Everything else about the seed is now just a starting point rather than the
   domain: the whole thing is editable in the app, so a new user is expected to
   replace most of it.
   ========================================================================== */

import { PALETTE, ALL_DAYS } from './routine.js'

const CAT = {
  skincare:   'cat_skincare',
  supplement: 'cat_supplement',
  workout:    'cat_workout',
  leisure:    'cat_leisure',
}

/* Step ids are literals here rather than `newId()` calls: the seed has to be
   deep-cloneable and identical on every device that reads it, and a freshly
   minted id per load would make two devices disagree about the same step.

   THEY ARE PREFIXED BY TEMPLATE, and that is not cosmetic. The same habit
   appears in Gym, Active and Rest; `s_<habitId>` gave all three the SAME step
   id, and `normaliseRoutine` — which runs on every load — deduped them and
   quietly deleted 12 of Active's 17 steps. Step ids only have to be unique
   inside their own template, and now they are.

   THAT MATTERS MORE IN v3 THAN IT DID IN v2. A step id is what completion is
   keyed by now, so two steps sharing one would not merely validate oddly — they
   would tick together.

   `time: null` means "take the habit's own time". A step only carries a string
   when it deliberately differs, which in this seed is nothing: the AM/PM split
   lives on the two separate habits until `dedupeLibrary` moves it onto the
   steps. */
const step = (tpl, habitId) => ({ id: `s_${tpl}_${habitId}`, kind: 'habit', habitId, time: null })
const wait = (tpl, key, minutes, note) => ({ id: `w_${tpl}_${key}`, kind: 'wait', minutes, note })

const gymStep = h => step('gym', h),    gymWait = (k, m, n) => wait('gym', k, m, n)
const actStep = h => step('act', h),    actWait = (k, m, n) => wait('act', k, m, n)
const restStep = h => step('rest', h),  restWait = (k, m, n) => wait('rest', k, m, n)

const SEED = {
  version: 3,

  /* Colours come off the reference palette in `routine.js`. The first three
     entries are the chromatic ones and the four categories take them plus
     American Silver — Bright Snow is left to the day templates, because a
     category chip and a day badge sitting in the same row want to differ. */
  categories: [
    { id: CAT.skincare,   label: 'Skincare',    color: PALETTE[2] }, // pale violet
    { id: CAT.supplement, label: 'Supplements', color: PALETTE[1] }, // orange
    { id: CAT.workout,    label: 'Workout',     color: PALETTE[0] }, // inchworm
    { id: CAT.leisure,    label: 'Leisure',     color: PALETTE[3] }, // american silver
  ],

  /* The library. A habit knows what it IS — never which days it runs on; that
     comes from the templates below.

     MOST OF THESE HAVE NO TIME, on purpose. A fifteen-step skincare routine is
     one sitting, not fifteen appointments, and pinning each step to a clock made
     the app read as a timetable instead of a stack you work through. Only the
     five things that are genuinely clock-bound carry a time — and they are
     exactly the five that carried a reminder in the old block-based build, so
     nothing is lost by untimeing the rest.

     DURATIONS ARE SHORT AND HONEST. They are what the step actually costs, so
     the day's total means something; a two-minute serum is two minutes, not a
     padded five. A `0` is not "instant", it is "not measured" — the UI omits it
     rather than printing "0 min".

     GLYPHS ARE RECOGNITION, NOT IDENTITY. Every row still carries its name; the
     icon is what lets you find the sunscreen in a fifteen-row list without
     reading. Where two steps are genuinely the same action at different times
     of day they share a glyph, because they are the same action. */
  habits: [
    { id: 'sk_am_cleanse', name: 'LUMACA Cleanser', categoryId: CAT.skincare, time: '06:30', remind: 10,
      icon: 'ShowerHead', duration: 2,
      detail: 'Cleanse and pat completely dry before next step', warn: '' },
    { id: 'sk_am_growth', name: 'Growth Serum (Minoxidil / Torongia)', categoryId: CAT.skincare, time: '', remind: null,
      icon: 'SprayCan', duration: 2,
      detail: 'Apply to dry skin', warn: '' },
    { id: 'sk_am_vitc', name: 'Vitamin C (Babaria)', categoryId: CAT.skincare, time: '', remind: null,
      icon: 'Sparkles', duration: 1,
      detail: 'Apply Babaria Vitamin C', warn: '' },
    { id: 'sk_am_ha', name: 'Hyaluronic Acid (Babaria)', categoryId: CAT.skincare, time: '', remind: null,
      icon: 'Droplets', duration: 1,
      detail: 'Mist face with water first, then apply HA to damp skin', warn: '' },
    { id: 'sk_am_lub', name: 'Lubriderm Men 3-in-1', categoryId: CAT.skincare, time: '', remind: null,
      icon: 'Droplet', duration: 1,
      detail: 'Moisturize — lock in the hydration', warn: '' },
    { id: 'sk_am_spf', name: 'ISDIN Sunscreen', categoryId: CAT.skincare, time: '', remind: null,
      icon: 'Sun', duration: 1,
      detail: 'Last step — every single day without exception', warn: '' },

    { id: 'tadalafil', name: 'Tadalafil', categoryId: CAT.supplement, time: '17:00', remind: 10,
      icon: 'Pill', duration: 1,
      detail: 'As prescribed — mid-afternoon, or before the gym on training days', warn: '' },

    /* Peptan® collagen: pre-workout timing is the clinically meaningful one —
       it primes connective-tissue synthesis. Don't "simplify" it to post. */
    { id: 'ablazor', name: 'Ablazor', categoryId: CAT.supplement, time: '18:30', remind: 10,
      icon: 'Bone', duration: 2,
      detail: '10g sachet — 30–60 min before gym', warn: '' },

    { id: 'whey', name: 'Whey Protein', categoryId: CAT.supplement, time: '21:00', remind: 5,
      icon: 'Milk', duration: 3,
      detail: '25–40g within 30–60 min after training', warn: '' },
    /* Grouped post-workout for convenience, not physiology: creatine needs
       daily consistency, not precise timing. */
    { id: 'creatine', name: 'Creatine', categoryId: CAT.supplement, time: '', remind: null,
      icon: 'Zap', duration: 1,
      detail: '3–5g — take right after workout', warn: '' },

    { id: 'sk_pm_cleanse', name: 'LUMACA Cleanser', categoryId: CAT.skincare, time: '22:00', remind: 10,
      icon: 'ShowerHead', duration: 2,
      detail: 'Cleanse — leave skin slightly damp for next step', warn: '' },
    { id: 'sk_pm_ha', name: 'Hyaluronic Acid (Babaria)', categoryId: CAT.skincare, time: '', remind: null,
      icon: 'Droplets', duration: 1,
      detail: 'Apply to damp skin immediately after cleanse', warn: '' },
    { id: 'sk_pm_retinol', name: 'Retinol (Babaria)', categoryId: CAT.skincare, time: '', remind: null,
      icon: 'Moon', duration: 1,
      detail: 'Only once the HA is fully dry — damp skin increases irritation',
      warn: 'Never layer with Vitamin C' },
    { id: 'sk_pm_min', name: 'Minoxidil / Torongia', categoryId: CAT.skincare, time: '', remind: null,
      icon: 'SprayCan', duration: 2,
      detail: 'Apply right after Retinol', warn: '' },
    { id: 'sk_pm_lub', name: 'Lubriderm Men 3-in-1', categoryId: CAT.skincare, time: '', remind: null,
      icon: 'Droplet', duration: 1,
      detail: 'Final step — seal everything in before sleep', warn: '' },
  ],

  /* Three named days. The waits are steps in their own right — the 10–15 min
     bone-dry gap before retinol is a real part of the evening, not a footnote
     on the step before it.

     `rest: true` on the Rest day is display only. It does not change what the
     day contains — Rest still has nine steps — it says what KIND of day it is,
     which is what lets the week strip colour it apart from the workload ramp
     instead of shading it as "a very light Gym day". */
  templates: [
    {
      id: 'tpl_gym', title: 'Gym', color: PALETTE[0], rest: false,
      steps: [
        gymStep('sk_am_cleanse'),
        gymStep('sk_am_growth'), gymWait('g1', 8, 'Let the serum absorb'),
        gymStep('sk_am_vitc'), gymWait('g2', 3, ''),
        gymStep('sk_am_ha'), gymWait('g3', 1, ''),
        gymStep('sk_am_lub'),
        gymStep('sk_am_spf'),
        gymStep('tadalafil'),
        gymStep('ablazor'),
        gymStep('whey'),
        gymStep('creatine'),
        gymStep('sk_pm_cleanse'),
        gymStep('sk_pm_ha'), gymWait('g4', 13, 'Bone-dry before retinol'),
        gymStep('sk_pm_retinol'),
        gymStep('sk_pm_min'), gymWait('g5', 3, ''),
        gymStep('sk_pm_lub'),
      ],
    },
    {
      id: 'tpl_active', title: 'Active', color: PALETTE[2], rest: false,
      steps: [
        actStep('sk_am_cleanse'),
        actStep('sk_am_growth'), actWait('a1', 8, 'Let the serum absorb'),
        actStep('sk_am_vitc'), actWait('a2', 3, ''),
        actStep('sk_am_ha'), actWait('a3', 1, ''),
        actStep('sk_am_lub'),
        actStep('sk_am_spf'),
        actStep('tadalafil'),
        actStep('sk_pm_cleanse'),
        actStep('sk_pm_ha'), actWait('a4', 13, 'Bone-dry before retinol'),
        actStep('sk_pm_retinol'),
        actStep('sk_pm_min'), actWait('a5', 3, ''),
        actStep('sk_pm_lub'),
      ],
    },
    {
      id: 'tpl_rest', title: 'Rest', color: PALETTE[3], rest: true,
      steps: [
        restStep('sk_am_cleanse'),
        restStep('sk_am_ha'), restWait('r1', 1, ''),
        restStep('sk_am_lub'),
        restStep('sk_am_spf'),
        restStep('tadalafil'),
        restStep('sk_pm_cleanse'),
        restStep('sk_pm_ha'),
        restStep('sk_pm_lub'),
      ],
    },
  ],

  /* Weekday → template. Index is the JS day: 0 = Sunday.
     Sun Active · Mon Gym · Tue Rest · Wed Gym · Thu Rest · Fri Gym · Sat Gym */
  week: ['tpl_active', 'tpl_gym', 'tpl_rest', 'tpl_gym', 'tpl_rest', 'tpl_gym', 'tpl_gym'],

  /* No day overrides its template's colour out of the box. The picker writes
     here; `null` means "whatever the template says", which is the state every
     day starts in and the state "Use the routine's colour" returns it to. */
  weekColor: ALL_DAYS.map(() => null),
}

/**
 * A fresh, deeply-cloned copy of the seed.
 *
 * Always a copy: the store, the reset button and the import fallback all hand
 * this straight into state, and React state sharing structure with a module
 * constant is one careless mutation away from a "default" that has quietly
 * picked up the user's edits — and then reseeds a wiped device wrong.
 */
export function defaultRoutine() {
  return structuredClone(SEED)
}

/**
 * Fill in glyphs and durations the seed knows, for habits that have none.
 * ────────────────────────────────────────────────────────────────────────────
 * A DEVICE UPGRADING FROM v2 HAS NEITHER, and without this it never would.
 * Its saved routine is the seed's habits under the seed's frozen ids, but with
 * `icon: ''` and `duration: 0` — so every row on Today falls back to the same
 * plain dot, and the whole glyph system reaches new installs only.
 *
 * MATCHED BY ID, WHICH IS THE ONLY THING THAT MAKES THIS SAFE. Habit ids are
 * the storage contract; `sk_am_spf` means the same thing on every device that
 * has ever run this app, so the seed's answer for it is that device's answer
 * too. A name match would be a guess and is not used.
 *
 * IT ONLY FILLS EMPTIES. A habit that already has a glyph — or that the user
 * deliberately left blank after choosing one, which is indistinguishable and is
 * the honest limit of this — keeps what it has. `duration` is treated the same
 * way: 0 means "not measured", so it is fillable; any positive number is a
 * choice and is left alone.
 *
 * Runs once, inside the same latched migration as the library dedupe. It is not
 * a repair pass and must not become one.
 */
export function backfillFromSeed(routine) {
  const seedHabits = new Map(SEED.habits.map(h => [h.id, h]))
  let touched = false

  const habits = routine.habits.map(h => {
    const s = seedHabits.get(h.id)
    if (!s) return h
    const icon = h.icon || s.icon || ''
    const duration = h.duration || s.duration || 0
    if (icon === (h.icon || '') && duration === (h.duration || 0)) return h
    touched = true
    return { ...h, icon, duration }
  })

  /* The rest flag, same rule and the same reason. Without it an upgraded device
     shades Tuesday and Thursday on the WORKLOAD ramp — an eight-step "light
     day" sitting next to a fifteen-step one — instead of colouring them as the
     rest days they have always been.

     ONE STATED LIMIT: `rest` is a boolean, so "never set" and "deliberately
     turned off" are indistinguishable, and this cannot tell them apart. It is
     safe only because the migration is LATCHED and runs before any v3 build
     could have offered the toggle. Do not lift this into a repair pass that
     runs more than once — the second run would overrule a real choice. */
  const seedTemplates = new Map(SEED.templates.map(t => [t.id, t]))
  const templates = routine.templates.map(t => {
    const s = seedTemplates.get(t.id)
    if (!s || !s.rest || t.rest) return t
    touched = true
    return { ...t, rest: true }
  })

  return touched ? { ...routine, habits, templates } : routine
}

/** An empty routine — the categories and nothing else. What the first-run flow
 *  starts from when someone chooses to build their week rather than take the
 *  shipped one. */
export function blankRoutine() {
  return {
    version: 3,
    categories: structuredClone(SEED.categories),
    habits: [],
    templates: [],
    week: [null, null, null, null, null, null, null],
    weekColor: ALL_DAYS.map(() => null),
  }
}
