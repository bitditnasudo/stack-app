/* ============================================================================
   PROTOCOL — the seed routine. What a fresh install starts with.
   ============================================================================
   Only the seed. The schema and every function that reads or rewrites a routine
   live in `routine.js`; editing this file changes what a NEW install begins
   with and what "Reset routine" restores, and touches nothing already saved on
   a device.

   WHY THE HABIT IDS BELOW ARE FROZEN
   Completion is persisted as `{ [habitId]: true }` per day, going back to the
   original GitHub Pages build. These fifteen ids are what that history is keyed
   by, so the seed reproduces them EXACTLY and the v1→v2 migration carries them
   across unchanged. A rename here orphans every tick ever recorded.
   `verify.mjs` asserts the set.

   Everything else about the seed is now just a starting point rather than the
   domain: the whole thing is editable in the app, so a new user is expected to
   replace most of it.
   ========================================================================== */

import { PALETTE } from './routine.js'

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
   inside their own template, and now they are. */
const step = (tpl, habitId) => ({ id: `s_${tpl}_${habitId}`, kind: 'habit', habitId })
const wait = (tpl, key, minutes, note) => ({ id: `w_${tpl}_${key}`, kind: 'wait', minutes, note })

const gymStep = h => step('gym', h),    gymWait = (k, m, n) => wait('gym', k, m, n)
const actStep = h => step('act', h),    actWait = (k, m, n) => wait('act', k, m, n)
const restStep = h => step('rest', h),  restWait = (k, m, n) => wait('rest', k, m, n)

const SEED = {
  version: 2,

  categories: [
    { id: CAT.skincare,   label: 'Skincare',    color: PALETTE[3] }, // sky
    { id: CAT.supplement, label: 'Supplements', color: PALETTE[1] }, // amber
    { id: CAT.workout,    label: 'Workout',     color: PALETTE[2] }, // coral
    { id: CAT.leisure,    label: 'Leisure',     color: PALETTE[0] }, // lime
  ],

  /* The library. A habit knows what it IS — never which days it runs on; that
     comes from the templates below.

     MOST OF THESE HAVE NO TIME, on purpose. A fifteen-step skincare routine is
     one sitting, not fifteen appointments, and pinning each step to a clock made
     the app read as a timetable instead of a stack you work through. Only the
     five things that are genuinely clock-bound carry a time — and they are
     exactly the five that carried a reminder in the old block-based build, so
     nothing is lost by untimeing the rest. */
  habits: [
    { id: 'sk_am_cleanse', name: 'LUMACA Cleanser', categoryId: CAT.skincare, time: '06:30', remind: 10,
      detail: 'Cleanse and pat completely dry before next step', warn: '' },
    { id: 'sk_am_growth', name: 'Growth Serum (Minoxidil / Torongia)', categoryId: CAT.skincare, time: '', remind: null,
      detail: 'Apply to dry skin', warn: '' },
    { id: 'sk_am_vitc', name: 'Vitamin C (Babaria)', categoryId: CAT.skincare, time: '', remind: null,
      detail: 'Apply Babaria Vitamin C', warn: '' },
    { id: 'sk_am_ha', name: 'Hyaluronic Acid (Babaria)', categoryId: CAT.skincare, time: '', remind: null,
      detail: 'Mist face with water first, then apply HA to damp skin', warn: '' },
    { id: 'sk_am_lub', name: 'Lubriderm Men 3-in-1', categoryId: CAT.skincare, time: '', remind: null,
      detail: 'Moisturize — lock in the hydration', warn: '' },
    { id: 'sk_am_spf', name: 'ISDIN Sunscreen', categoryId: CAT.skincare, time: '', remind: null,
      detail: 'Last step — every single day without exception', warn: '' },

    { id: 'tadalafil', name: 'Tadalafil', categoryId: CAT.supplement, time: '17:00', remind: 10,
      detail: 'As prescribed — mid-afternoon, or before the gym on training days', warn: '' },

    /* Peptan® collagen: pre-workout timing is the clinically meaningful one —
       it primes connective-tissue synthesis. Don't "simplify" it to post. */
    { id: 'ablazor', name: 'Ablazor', categoryId: CAT.supplement, time: '18:30', remind: 10,
      detail: '10g sachet — 30–60 min before gym', warn: '' },

    { id: 'whey', name: 'Whey Protein', categoryId: CAT.supplement, time: '21:00', remind: 5,
      detail: '25–40g within 30–60 min after training', warn: '' },
    /* Grouped post-workout for convenience, not physiology: creatine needs
       daily consistency, not precise timing. */
    { id: 'creatine', name: 'Creatine', categoryId: CAT.supplement, time: '', remind: null,
      detail: '3–5g — take right after workout', warn: '' },

    { id: 'sk_pm_cleanse', name: 'LUMACA Cleanser', categoryId: CAT.skincare, time: '22:00', remind: 10,
      detail: 'Cleanse — leave skin slightly damp for next step', warn: '' },
    { id: 'sk_pm_ha', name: 'Hyaluronic Acid (Babaria)', categoryId: CAT.skincare, time: '', remind: null,
      detail: 'Apply to damp skin immediately after cleanse', warn: '' },
    { id: 'sk_pm_retinol', name: 'Retinol (Babaria)', categoryId: CAT.skincare, time: '', remind: null,
      detail: 'Only once the HA is fully dry — damp skin increases irritation',
      warn: 'Never layer with Vitamin C' },
    { id: 'sk_pm_min', name: 'Minoxidil / Torongia', categoryId: CAT.skincare, time: '', remind: null,
      detail: 'Apply right after Retinol', warn: '' },
    { id: 'sk_pm_lub', name: 'Lubriderm Men 3-in-1', categoryId: CAT.skincare, time: '', remind: null,
      detail: 'Final step — seal everything in before sleep', warn: '' },
  ],

  /* Three named days. The waits are steps in their own right — the 10–15 min
     bone-dry gap before retinol is a real part of the evening, not a footnote
     on the step before it. */
  templates: [
    {
      id: 'tpl_gym', title: 'Gym', color: PALETTE[2],
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
      id: 'tpl_active', title: 'Active', color: PALETTE[4],
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
      id: 'tpl_rest', title: 'Rest', color: PALETTE[5],
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

/** An empty routine — the categories and nothing else. What the first-run flow
 *  starts from when someone chooses to build their week rather than take the
 *  shipped one. */
export function blankRoutine() {
  return {
    version: 2,
    categories: structuredClone(SEED.categories),
    habits: [],
    templates: [],
    week: [null, null, null, null, null, null, null],
  }
}
