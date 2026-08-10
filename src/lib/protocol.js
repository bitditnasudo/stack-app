/* ============================================================================
   PROTOCOL — the domain. What Arath does, on which days, in what order.
   ============================================================================
   This is the one file that encodes the actual routine. Everything else in the
   app is presentation over what `buildTasks()` returns.

   THE WEEK
     Mon / Wed / Fri  gym (full-body hypertrophy) + full actives + full supps
     Sat              mobility / stretch (45 min) + full actives + Ablazor & post
     Sun              active skincare, NO workout, NO supplements
     Tue / Thu        rest: barrier-only skincare, flexible supplement timing

   TWO INDEPENDENT FLAGS, and conflating them is the classic bug here:
     · "active"  → the retinoid / vitamin C / minoxidil nights.  Sun Mon Wed Fri Sat
     · "workout" → a gym or mobility session.                        Mon Wed Fri Sat
   Sunday is active but has no workout. Never derive one from the other.

   TASK IDs ARE A STORAGE CONTRACT. Completion is persisted as
   `{ [taskId]: true }` per day, so renaming an id silently orphans history —
   including the history imported from the old GitHub Pages build. Add ids
   freely; never rename or reuse one.
   ========================================================================== */

/* JS day index: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat */
export const ACTIVE_DAYS = [0, 1, 3, 5, 6]

export const WORKOUT_MAP = {
  1: { day: 1, label: 'Full Body' }, // Mon
  3: { day: 2, label: 'Full Body' }, // Wed
  5: { day: 3, label: 'Full Body' }, // Fri
  6: { day: 4, label: 'Stretch'   }, // Sat — mobility, still a session
}

export function isActiveDay(jsDay) { return ACTIVE_DAYS.includes(jsDay) }
export function getWorkout(jsDay)  { return WORKOUT_MAP[jsDay] || null }

/** Ordered time blocks. `renderTasks` walks these, so order here is screen order. */
export const BLOCKS = [
  { id: 'morning',     label: 'Morning Skincare', time: '6:30 – 7:00 AM'  },
  { id: 'afternoon',   label: 'Afternoon',        time: '5:00 – 6:00 PM'  },
  { id: 'preworkout',  label: 'Pre-Workout',      time: '6:30 – 7:00 PM'  },
  { id: 'postworkout', label: 'Post-Workout',     time: '9:00 – 9:30 PM'  },
  { id: 'evening',     label: 'Evening Skincare', time: '10:00 – 10:30 PM' },
]

/** tag → kit Tag tone. Semantic, never a colour name (kit house rule). */
export const TAG_TONE = {
  supp:   'brand',
  skin:   'info',
  active: 'warn',
  daily:  'neutral',
  pre:    'warn',
  post:   'ok',
}

/**
 * The day's checklist.
 *
 * Shape per task:
 *   id        stable storage key — see the contract note above
 *   block     one of BLOCKS[].id
 *   name      product / supplement
 *   detail    what to do
 *   target    clock target, rendered as a separate pill (was inline "⏰ …" text)
 *   warn      hard contraindication, rendered as a danger pill
 *   wait      dwell time before the NEXT step (was inline "⏳ …" text)
 *   tags      badges; category drives the Overview supp/skin split
 */
export function buildTasks(active, workout) {
  const t = []

  /* ── Morning skincare ─────────────────────────────────────────────────── */
  t.push({
    id: 'sk_am_cleanse', block: 'morning', category: 'skin', tags: ['skin'],
    name: 'LUMACA Cleanser',
    detail: 'Cleanse and pat completely dry before next step',
  })
  if (active) {
    t.push({
      id: 'sk_am_growth', block: 'morning', category: 'skin', tags: ['skin', 'active'],
      name: 'Growth Serum (Minoxidil / Torongia)',
      detail: 'Apply to dry skin — active days only',
      wait: 'Wait 5–10 min before next step',
    })
    t.push({
      id: 'sk_am_vitc', block: 'morning', category: 'skin', tags: ['skin', 'active'],
      name: 'Vitamin C (Babaria)',
      detail: 'Apply Babaria Vitamin C — active days only',
      wait: 'Wait 2–3 min before next step',
    })
  }
  t.push({
    id: 'sk_am_ha', block: 'morning', category: 'skin', tags: ['skin'],
    name: 'Hyaluronic Acid (Babaria)',
    detail: 'Mist face with water first, then apply HA to damp skin',
    wait: 'Wait 1 min before next step',
  })
  t.push({
    id: 'sk_am_lub', block: 'morning', category: 'skin', tags: ['skin'],
    name: 'Lubriderm Men 3-in-1',
    detail: 'Moisturize — lock in the hydration',
  })
  t.push({
    id: 'sk_am_spf', block: 'morning', category: 'skin', tags: ['skin', 'daily'],
    name: 'ISDIN Sunscreen',
    detail: 'Last step — every single day without exception',
  })

  /* ── Afternoon ────────────────────────────────────────────────────────── */
  t.push({
    id: 'tadalafil', block: 'afternoon', category: 'supp', tags: ['daily', 'supp'],
    name: 'Tadalafil',
    detail: workout
      ? 'As prescribed — take before heading to gym'
      : 'As prescribed — take in the afternoon',
    target: '~5:00–6:00 PM',
  })

  /* ── Pre-workout (session days only) ──────────────────────────────────── */
  if (workout) {
    t.push({
      id: 'ablazor', block: 'preworkout', category: 'supp', tags: ['pre', 'supp'],
      name: 'Ablazor',
      // Peptan® collagen: pre-workout timing is the clinically meaningful one —
      // it primes connective-tissue synthesis. Don't "simplify" this to post.
      detail: '10g sachet — 30–60 min before gym',
      target: '6:30–7:00 PM (gym at 7:30 PM)',
    })
  }

  /* ── Post-workout (session days only) ─────────────────────────────────── */
  if (workout) {
    t.push({
      id: 'whey', block: 'postworkout', category: 'supp', tags: ['post', 'supp'],
      name: 'Whey Protein',
      detail: '25–40g within 30–60 min after training',
      target: '~9:00–9:30 PM',
    })
    t.push({
      id: 'creatine', block: 'postworkout', category: 'supp', tags: ['post', 'supp'],
      name: 'Creatine',
      detail: '3–5g — take right after workout',
      target: '~9:00–9:30 PM',
    })
  }

  /* ── Evening skincare ─────────────────────────────────────────────────── */
  t.push({
    id: 'sk_pm_cleanse', block: 'evening', category: 'skin', tags: ['skin'],
    name: 'LUMACA Cleanser',
    detail: 'Cleanse — leave skin slightly damp for next step',
    target: 'Start 10:00–10:30 PM',
  })
  t.push({
    id: 'sk_pm_ha', block: 'evening', category: 'skin', tags: ['skin'],
    name: 'Hyaluronic Acid (Babaria)',
    detail: 'Apply to damp skin immediately after cleanse',
    // Only on active nights: retinol on damp skin increases irritation, so the
    // skin has to be bone-dry first. On non-active nights nothing follows.
    wait: active ? 'Wait 10–15 min until bone-dry before next step' : null,
  })
  if (active) {
    t.push({
      id: 'sk_pm_retinol', block: 'evening', category: 'skin', tags: ['skin', 'active'],
      name: 'Retinol (Babaria)',
      detail: 'Apply after HA is fully dry — active nights only',
      warn: 'Never layer with Vitamin C',
    })
    t.push({
      id: 'sk_pm_min', block: 'evening', category: 'skin', tags: ['skin', 'active'],
      name: 'Minoxidil / Torongia',
      detail: 'Apply right after Retinol',
      wait: 'Wait 2–3 min before next step',
    })
  }
  t.push({
    id: 'sk_pm_lub', block: 'evening', category: 'skin', tags: ['skin'],
    name: 'Lubriderm Men 3-in-1',
    detail: 'Final step — seal everything in before sleep',
  })

  return t
}

/** The checklist for a given date. */
export function tasksForDate(d = new Date()) {
  const jsDay = d.getDay()
  return buildTasks(isActiveDay(jsDay), getWorkout(jsDay))
}

/** How many tasks a day *should* have — used to score days with no saved total. */
export function expectedTotalFor(d) {
  return tasksForDate(d).length
}

/** Badge for a day: what kind of day is it. Semantic tone, not a colour. */
export function dayKind(jsDay) {
  const workout = getWorkout(jsDay)
  if (workout && jsDay === 6) return { text: 'MOBILITY', tone: 'info',    label: `Day ${workout.day} — ${workout.label}` }
  if (workout)                return { text: 'GYM',      tone: 'brand',   label: `Day ${workout.day} — ${workout.label}` }
  if (isActiveDay(jsDay))     return { text: 'ACTIVE',   tone: 'warn',    label: 'Active day' }
  return                             { text: 'REST',     tone: 'neutral', label: 'Rest day' }
}

/* ============================================================================
   NOTIFICATIONS — fire times, not target times.
   ============================================================================
   Each entry fires ~10 min BEFORE the block it announces, so the reminder is
   actionable rather than late. `days` is in JS day indices.

   Scheduling is `setTimeout` in the page, which only survives while the app is
   open or backgrounded — the same limitation the original had. A real fix needs
   the Notification Triggers API (Chromium only, behind a flag) or a push
   service; see CLAUDE.md → "Known limitations".
   ========================================================================== */
export const NOTIF_SCHEDULE = [
  {
    id: 'morning', hour: 6, min: 20,
    title: 'Morning skincare in 10 min',
    body: 'LUMACA → Growth Serum → Vitamin C → HA → Lubriderm → Sunscreen',
    days: [0, 1, 2, 3, 4, 5, 6],
  },
  {
    id: 'tadalafil', hour: 16, min: 50,
    title: 'Tadalafil — 10 min reminder',
    body: 'Take as prescribed before heading to the gym.',
    days: [0, 1, 2, 3, 4, 5, 6],
  },
  {
    id: 'preworkout', hour: 18, min: 20,
    title: 'Pre-workout in 10 min',
    body: 'Ablazor 10g sachet — gym starts at 7:30 PM.',
    days: [1, 3, 5, 6],
  },
  {
    id: 'postworkout', hour: 20, min: 55,
    title: 'Post-workout stack',
    body: 'Whey 25–40g + Creatine 3–5g — take now.',
    days: [1, 3, 5, 6],
  },
  {
    id: 'evening', hour: 21, min: 50,
    title: 'Evening skincare in 10 min',
    body: 'Cleanse → HA → Retinol → Minoxidil → Lubriderm. Bed at 11 PM.',
    days: [0, 1, 2, 3, 4, 5, 6],
  },
]
