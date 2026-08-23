/* ============================================================================
   ROUTINE — the engine. Pure functions over a routine document. SCHEMA v3.
   ============================================================================
   v1 modelled the protocol the way the ORIGINAL protocol happened to be shaped:
   tasks lived in fixed time blocks, and overlapping "day types" decided which
   days each one ran. v2 replaced that with habits + templates + a week map.
   v3 keeps all of it and fixes the one thing v2 could not express.

   THE DOCUMENT

     routine = {
       version: 3,
       categories: [{ id, label, color }],    what KIND of thing a habit is
       habits:     [{ id, name, detail, time, categoryId, remind, warn,
                      icon, duration }],
       templates:  [{ id, title, color, rest, steps: [Step] }],
       week:       [t0 … t6],                 weekday → template id (or null)
       weekColor:  [c0 … c6],                 weekday → mood colour override
     }

     Step = { id, kind: 'habit', habitId, time }
          | { id, kind: 'wait',  minutes, note }

   THE THREE IDEAS, AND WHY THEY ARE SEPARATE

   1. A HABIT is a thing you do — a name, a category, a glyph and how long it
      takes. It knows nothing about which days it happens on. That is what makes
      it reusable: "Creatine" is one habit whether it appears on three days or
      seven.

   2. A TEMPLATE is a named day — a mood ("Gym day", "Slow Sunday"), a colour,
      and an ORDERED list of steps. The order is the point: it is the sequence
      you actually move through, and WAITS ARE STEPS IN IT rather than a note
      attached to the habit before them.

   3. THE WEEK is seven slots, each pointing at a template. Mon/Wed/Fri sharing
      one "Gym day" is the whole reason templates exist — configure once, edit
      once.

   ── WHAT v3 CHANGED, AND WHY IT HAD TO ────────────────────────────────────

   A. A HABIT MAY APPEAR IN A DAY MORE THAN ONCE.
      v2's `addHabitStep` refused a duplicate, so "glass of water, four times"
      was inexpressible and the shipped library worked around it by carrying the
      SAME item twice under two ids — `sk_am_cleanse` and `sk_pm_cleanse` are
      both "LUMACA Cleanser". That workaround is what the library dedupe removes
      (see `dedupeLibrary`), and it is only safe to remove once a habit can
      legitimately repeat. The two changes are one change.

   B. COMPLETION IS KEYED BY STEP ID, NOT HABIT ID.
      Directly forced by (A): if one habit occupies two rows of a day, a tick
      has to say WHICH ROW. `{ [habitId]: true }` cannot, so ticking the morning
      cleanse ticked the evening one too. Day logs now key on `step.id`.
      **The old keys still resolve** — see `stepDoneIn` — because eight months
      of history is keyed by habit id and none of it may be dropped. A habit id
      in a log counts against the FIRST step of that habit in the day, which is
      exact, because a habit could never appear twice before this version.

   C. A STEP MAY OVERRIDE ITS HABIT'S TIME.
      Also forced by (A). Merging the AM and PM cleanse into one habit would
      otherwise destroy the 06:30/22:00 split — a habit holds one `time`, and
      the reminders it drives were real. `step.time` is `null` to inherit the
      habit's, or a string to override it (`''` meaning "no time on this one").
      `habit.remind` stays on the habit: it is a LEAD TIME, not a clock time, so
      it applies unchanged to every step of that habit that has an effective
      time — which is exactly what the AM/PM pair had before the merge.

   D. A TEMPLATE CAN BE MARKED A REST DAY, and a weekday can override its
      template's colour (`weekColor`). Both are display-only and neither
      reintroduces per-day step overrides, which stay rejected: a day that needs
      different STEPS still needs its own template.

   TASK IDS ARE STILL A STORAGE CONTRACT. `habit.id` is the same string
   `task.id` was in the GitHub Pages build, the v1 migration carries every one
   across unchanged, and `dedupeLibrary` rewrites history rather than orphaning
   it. Never rename or reuse one.
   ========================================================================== */

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

/** Monday-first, for every day picker in the UI. */
export const DAY_ORDER  = [1, 2, 3, 4, 5, 6, 0]

/**
 * The seven weekdays in the order the guided builder walks them: starting at
 * the day the user chose, then onward through the week and wrapping.
 *
 * IT IS A ROTATION, NOT A SORT. Picking Wednesday gives W T F S S M T — the
 * days keep their real adjacency, so "the next day" in the flow is the next day
 * in the week. Sorting numerically instead would hand back M T W T F S S with
 * Wednesday highlighted somewhere in the middle, which is a list of seven days
 * rather than a route through them.
 *
 * An unknown start day falls back to Monday-first rather than returning
 * something short: the builder walks whatever this returns, so a bad `?day=`
 * must not be able to skip days.
 */
export function weekFrom(startDay) {
  const at = DAY_ORDER.indexOf(startDay)
  if (at < 0) return [...DAY_ORDER]
  return [...DAY_ORDER.slice(at), ...DAY_ORDER.slice(0, at)]
}
export const DAY_SHORT  = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday',
                           'Thursday', 'Friday', 'Saturday']

/* ── Colour ──────────────────────────────────────────────────────────────────
   Categories and templates carry a LITERAL hex, not one of the kit's semantic
   tones. That is a deliberate exception to "semantic names, never colour
   names", and the same one the kit already makes for Budget's account colours:
   a category's colour means nothing — it is identity, chosen by the user, with
   no status to encode. `colorUtils.getContrastText` picks the ink, so any
   colour added here stays readable without a second measurement.

   THE SET IS THE REFERENCE PALETTE, MINUS THE ONE ENTRY THAT CANNOT BE AN
   IDENTITY COLOUR. Gunmetal #243837 measures 1.31:1 as a `.mood` chip, 1.30:1
   as a week pill and 1.53:1 against the page — those components ink WITH the
   colour they wash, so a near-black entry is invisible in all three. It is not
   discarded; it is `REST_COLOR` below, where it is a solid fill under light ink
   and measures 12.38:1. Every other entry clears AA in all three contexts:

     Inchworm         9.28 / 8.20 / 15.07
     Orange           5.10 / 4.76 /  7.12
     Pale Violet      5.82 / 5.35 /  8.50
     American Silver  7.91 / 7.03 / 12.39
     Bright Snow     10.90 / 9.47 / 18.92

   `scripts/contrast.mjs` re-measures all of it; do not edit this list without
   running it. Note the last two are both near-neutral and are the one pair a
   user can mistake for each other at chip size — they are kept because the
   reference palette has both, but a new CATEGORY should prefer the first three.
*/
export const PALETTE = [
  '#B1FA63', // Inchworm
  '#FE7733', // Orange
  '#B2A1FF', // Pale Violet
  '#D1D1D1', // American Silver
  '#FFFFFF', // Bright Snow
]

/**
 * Rest days get ONE fixed colour, and it is deliberately not on the ramp the
 * other days are shaded along. The week pill's saturation encodes how much work
 * a day holds; a rest day holds none, so shading it by that rule would put it
 * at the pale end next to a genuinely light day and make the two unreadable
 * against each other. A separate tone makes "nothing today" a different KIND of
 * thing rather than the bottom of a scale.
 */
export const REST_COLOR = '#243837' // Gunmetal — solid fill only, never a wash

/* ── Ids ─────────────────────────────────────────────────────────────────── */
let idCounter = 0
export function newId(prefix = 'x') {
  idCounter = (idCounter + 1) % 4096
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${idCounter.toString(36)}`
}

/* ── Reading ─────────────────────────────────────────────────────────────── */

const byId = (list, id) => list.find(x => x.id === id) || null

export const getHabit    = (r, id) => byId(r.habits, id)
export const getCategory = (r, id) => byId(r.categories, id)
export const getTemplate = (r, id) => byId(r.templates, id)

/** The template a given weekday runs, or null for a day left unconfigured. */
export function templateForDay(routine, jsDay) {
  const id = routine.week?.[jsDay]
  return id ? getTemplate(routine, id) : null
}

/** Which weekdays run a given template. */
export function daysForTemplate(routine, templateId) {
  return ALL_DAYS.filter(d => routine.week[d] === templateId)
}

/**
 * The colour a weekday shows. The user picks it per day; a day built from a
 * template starts on the template's colour and may then diverge, which is why
 * the override is stored on the WEEK and not on the template — writing it back
 * to the template would silently recolour every other day sharing it.
 *
 * Rest is not an override, it is a different axis: a rest day reads REST_COLOR
 * whatever else is set, so "today is rest" survives any palette choice.
 */
export function dayColorFor(routine, jsDay) {
  const tpl = templateForDay(routine, jsDay)
  if (tpl?.rest) return REST_COLOR
  return routine.weekColor?.[jsDay] || tpl?.color || null
}

export function isRestDay(routine, jsDay) {
  return !!templateForDay(routine, jsDay)?.rest
}

/**
 * A day's steps, resolved: every step carries the habit and category it points
 * at, plus the TIME that actually applies to it, so a screen never has to work
 * any of it out itself.
 *
 * A habit step whose habit was deleted is DROPPED rather than rendered blank —
 * `removeHabit` already cleans templates, so a dangling reference means the
 * document was hand-edited, and a phantom row is worse than a missing one.
 */
export function stepsForDay(routine, jsDay) {
  const tpl = templateForDay(routine, jsDay)
  if (!tpl) return []
  return resolveSteps(routine, tpl)
}

export function resolveSteps(routine, template) {
  const out = []
  for (const step of template.steps || []) {
    if (step.kind === 'wait') { out.push({ ...step }); continue }
    const habit = getHabit(routine, step.habitId)
    if (!habit) continue
    out.push({
      ...step,
      habit,
      category: getCategory(routine, habit.categoryId),
      time: effectiveTime(step, habit),
      duration: habit.duration || 0,
    })
  }
  return out
}

/** `null` inherits the habit's time; a string overrides it, and '' is a
 *  deliberate "no time on this occurrence". See (C) in the header. */
export function effectiveTime(step, habit) {
  return step?.time != null ? step.time : (habit?.time || '')
}

/** Just the tickable steps — waits are not achievements. */
export function habitStepsForDay(routine, jsDay) {
  return stepsForDay(routine, jsDay).filter(s => s.kind === 'habit')
}

/** The weekdays a habit actually runs on, derived from the week map. Never
 *  stored on the habit: storing it would duplicate the templates and drift. */
export function habitDays(routine, habitId) {
  return ALL_DAYS.filter(d => {
    const tpl = templateForDay(routine, d)
    return !!tpl?.steps?.some(s => s.kind === 'habit' && s.habitId === habitId)
  })
}

/** Every template that contains a habit. */
export function templatesWithHabit(routine, habitId) {
  return routine.templates.filter(t => t.steps.some(s => s.kind === 'habit' && s.habitId === habitId))
}

/** How many times a habit appears in one template. Repeats are legal now, and
 *  the editor has to be able to say "×4" rather than pretend there is one. */
export function habitCountIn(template, habitId) {
  return (template?.steps || []).filter(s => s.kind === 'habit' && s.habitId === habitId).length
}

/** A habit no template uses. Not an error — it is a habit you have not put in
 *  a day yet — but the editor has to say so, or it silently never appears. */
export function isUnusedHabit(routine, habitId) {
  return templatesWithHabit(routine, habitId).length === 0
}

/** The day's badge and title, from its template. */
export function dayKindFor(routine, jsDay) {
  const tpl = templateForDay(routine, jsDay)
  if (!tpl) return { text: 'OPEN', label: 'Nothing planned', color: null, rest: false, template: null }
  return {
    text: tpl.title.toUpperCase(),
    label: tpl.title,
    color: dayColorFor(routine, jsDay),
    rest: !!tpl.rest,
    template: tpl,
  }
}

/** Today's habit steps bucketed by category, for the dashboard breakdown. */
export function stepsByCategory(routine, steps, checked = {}) {
  const habits = steps.filter(s => s.kind === 'habit')
  return routine.categories
    .map(cat => {
      const mine = habits.filter(s => s.habit.categoryId === cat.id)
      return {
        category: cat,
        total: mine.length,
        done: mine.filter(s => stepDoneIn(checked, s, habits)).length,
      }
    })
    .filter(x => x.total > 0)
}

/**
 * Is this step ticked?
 * ────────────────────────────────────────────────────────────────────────────
 * THE BACK-COMPATIBLE READ, and the reason no history was lost when completion
 * moved from habit ids to step ids (see (B) in the header).
 *
 * A log written by this version keys on `step.id` and that is the whole answer.
 * A log written by any earlier version keys on `habitId` — and in those
 * versions a habit could appear at most ONCE in a day, so the tick can only
 * ever have meant the first occurrence. Counting it against the first step is
 * therefore exact, not a guess; and it is scoped to the first, so a repeat
 * added after the fact does not arrive pre-ticked.
 */
export function stepDoneIn(checked, step, habitSteps) {
  if (!checked) return false
  if (checked[step.id]) return true
  if (!checked[step.habitId]) return false
  const first = habitSteps.find(s => s.habitId === step.habitId)
  return first?.id === step.id
}

/** Total minutes a day's waits ask you to stand around for. */
export function totalWaitMinutes(steps) {
  return steps.filter(s => s.kind === 'wait').reduce((n, s) => n + (s.minutes || 0), 0)
}

/** Everything a day asks of you in minutes — the habits' durations plus the
 *  waits between them. Waits count HERE (they occupy real time) even though
 *  they never count towards the score. */
export function totalDayMinutes(steps) {
  return steps.reduce((n, s) => n + (s.kind === 'wait' ? (s.minutes || 0) : (s.duration || 0)), 0)
}

/* ── Time ────────────────────────────────────────────────────────────────── */

export function parseTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '')
  if (!m) return null
  const hour = +m[1], min = +m[2]
  if (hour > 23 || min > 59) return null
  return { hour, min }
}

export function formatTime(hhmm) {
  const t = parseTime(hhmm)
  if (!t) return ''
  const d = new Date()
  d.setHours(t.hour, t.min, 0, 0)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** "45 min", "1 h", "1 h 30". Waits and durations are read at a glance. */
export function formatWait(minutes) {
  const m = Math.max(0, Math.round(minutes || 0))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} h ${rest}` : `${h} h`
}

export const formatDuration = formatWait

/** Minutes since local midnight, for the wake→sleep progress bar. */
export function minutesOfDay(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes()
}

/**
 * How far through the waking day it is, 0–100.
 *
 * A SLEEP TIME PAST MIDNIGHT IS NORMAL and it is the only interesting case.
 * "Awake 07:00 → 00:30" is a 17.5 hour window that wraps, so the naive
 * `(now - wake) / (sleep - wake)` goes negative for every waking hour of it.
 * Wrapping the END forward by a day when it sorts before the start is what
 * makes 23:00 and 00:30 both behave.
 *
 * `now` IS ONLY WRAPPED WHEN THE WINDOW ITSELF WRAPS, and that distinction is
 * the whole correctness of this function. 05:00 against a 07:00 → 00:30 window
 * is the tail of last night and belongs at ~99%; the same 05:00 against a
 * 07:00 → 23:00 window is simply before you got up and belongs at 0%. Wrapping
 * unconditionally made the second one read 100% — "your day is over" two hours
 * before it starts.
 *
 * Returns null when either end is unset — no bar is better than a bar that is
 * quietly showing a default someone never chose.
 */
export function dayProgress(wake, sleep, at = new Date()) {
  const w = parseTime(wake), s = parseTime(sleep)
  if (!w || !s) return null

  const start = w.hour * 60 + w.min
  let end = s.hour * 60 + s.min
  const wraps = end <= start
  if (wraps) end += 1440

  let now = minutesOfDay(at)
  if (wraps && now < start) now += 1440

  if (now <= start) return 0
  if (now >= end) return 100
  return Math.round(((now - start) / (end - start)) * 100)
}

/** Sort key for a habit step: its effective time, or +∞ so untimed steps sink. */
const timeKeyOf = hhmm => {
  const t = parseTime(hhmm)
  return t ? t.hour * 60 + t.min : Infinity
}

/* ── Notifications ───────────────────────────────────────────────────────────
   Derived from the STEPS now rather than from the habits, which is what (C) in
   the header bought: one "LUMACA Cleanser" habit sitting at 06:30 in the
   morning stack and 22:00 in the evening one produces the two reminders the two
   separate habits used to, and it does it without the duplicate.

   `remind` stays on the habit because it is a LEAD TIME — "ten minutes before"
   is a property of the thing, not of the occurrence — so both occurrences
   inherit it and each fires against its own clock time.

   Steps sharing a fire time are merged into one notification, because three
   separate buzzes at 06:20 is three chances to dismiss the whole morning. */
export function notifScheduleFor(routine) {
  const bucket = new Map()

  for (const tpl of routine.templates) {
    const days = daysForTemplate(routine, tpl.id)
    if (!days.length) continue

    for (const step of tpl.steps) {
      if (step.kind !== 'habit') continue
      const habit = getHabit(routine, step.habitId)
      if (!habit || habit.remind == null) continue

      const t = parseTime(effectiveTime(step, habit))
      if (!t) continue

      // Clamp rather than wrap: a reminder for a 00:05 step belongs at midnight
      // that morning, not at 23:55 the evening before, where `days` would then
      // be pointing at the wrong day entirely.
      const at = Math.max(0, t.hour * 60 + t.min - habit.remind)
      const key = `${at}`

      if (!bucket.has(key)) bucket.set(key, { at, names: [], days: new Set() })
      const b = bucket.get(key)
      // One habit in two templates at the same time is ONE line, not two.
      if (!b.names.includes(habit.name)) b.names.push(habit.name)
      for (const d of days) b.days.add(d)
    }
  }

  return [...bucket.values()]
    .sort((a, b) => a.at - b.at)
    .map(b => ({
      id: `at-${b.at}`,
      hour: Math.floor(b.at / 60),
      min: b.at % 60,
      title: b.names.length === 1 ? `${b.names[0]} soon` : `${b.names.length} things coming up`,
      body: b.names.join(' → '),
      days: [...b.days].sort(),
    }))
}

/* ── Writing — all pure, each returns a new routine ──────────────────────── */

const replace = (list, item) =>
  list.some(x => x.id === item.id) ? list.map(x => (x.id === item.id ? item : x)) : [...list, item]

export function upsertHabit(routine, habit) {
  return { ...routine, habits: replace(routine.habits, habit) }
}

/** Deleting a habit pulls it out of every template that used it. Leaving the
 *  step behind would render a blank row on the day it appears. */
export function removeHabit(routine, habitId) {
  return {
    ...routine,
    habits: routine.habits.filter(h => h.id !== habitId),
    templates: routine.templates.map(t => ({
      ...t,
      steps: t.steps.filter(s => !(s.kind === 'habit' && s.habitId === habitId)),
    })),
  }
}

export function upsertCategory(routine, cat) {
  return { ...routine, categories: replace(routine.categories, cat) }
}

/** Deleting a category re-homes its habits onto the first surviving one rather
 *  than deleting them — a habit without a category still has to render. */
export function removeCategory(routine, catId) {
  const rest = routine.categories.filter(c => c.id !== catId)
  if (!rest.length) return routine
  return {
    ...routine,
    categories: rest,
    habits: routine.habits.map(h => (h.categoryId === catId ? { ...h, categoryId: rest[0].id } : h)),
  }
}

export function upsertTemplate(routine, tpl) {
  return { ...routine, templates: replace(routine.templates, tpl) }
}

/** Deleting a template also frees every weekday pointing at it — and clears the
 *  colour those days had picked, which would otherwise outlive the day it was
 *  chosen for and show up on whatever template lands there next.
 *
 *  IT DOES NOT TOUCH LOGGED DAYS. A day already built from this template keeps
 *  the ticks it recorded: they are keyed by step id, the log holds its own
 *  denominator, and history is not a view of the current routine. */
export function removeTemplate(routine, tplId) {
  return {
    ...routine,
    templates: routine.templates.filter(t => t.id !== tplId),
    week: routine.week.map(id => (id === tplId ? null : id)),
    weekColor: (routine.weekColor || []).map((c, d) => (routine.week[d] === tplId ? null : c)),
  }
}

/** Rename a template. Separate from `upsertTemplate` only so the CRUD surface
 *  reads as the four verbs it offers rather than as one generic write. */
export function renameTemplate(routine, tplId, title) {
  const tpl = getTemplate(routine, tplId)
  if (!tpl) return routine
  const next = String(title || '').trim().slice(0, 40)
  if (!next) return routine
  return upsertTemplate(routine, { ...tpl, title: next })
}

/**
 * Copy a template, steps and all.
 *
 * The step ids are MINTED FRESH rather than copied. Step ids only have to be
 * unique inside their own template, so copying them would validate — but
 * completion is keyed by step id now, and a copy that shared them would inherit
 * the original's ticks on every day it ran.
 */
export function duplicateTemplate(routine, tplId, title) {
  const tpl = getTemplate(routine, tplId)
  if (!tpl) return routine
  return upsertTemplate(routine, {
    ...tpl,
    id: newId('tpl'),
    title: (title || `${tpl.title} copy`).slice(0, 40),
    steps: tpl.steps.map(s => ({ ...s, id: newId(s.kind === 'wait' ? 'wait' : 'step') })),
  })
}

/** Point one weekday at a template (or at nothing). Picking up a template also
 *  drops any colour the day had chosen, so it starts from the template's own —
 *  which is exactly what "pre-fill with the template's colour" means. */
export function assignDay(routine, jsDay, templateId) {
  const week = [...routine.week]
  week[jsDay] = templateId || null
  const weekColor = [...(routine.weekColor || ALL_DAYS.map(() => null))]
  weekColor[jsDay] = null
  return { ...routine, week, weekColor }
}

/** The manual per-day mood colour. `null` falls back to the template's. */
export function setDayColor(routine, jsDay, color) {
  const weekColor = [...(routine.weekColor || ALL_DAYS.map(() => null))]
  weekColor[jsDay] = color || null
  return { ...routine, weekColor }
}

/** Point a set of weekdays at a template, and clear it from the others. This is
 *  what the template editor's day picker saves. */
export function setTemplateDays(routine, templateId, days) {
  const week = routine.week.map((id, d) =>
    days.includes(d) ? templateId : (id === templateId ? null : id))
  return { ...routine, week }
}

/* ── Steps ───────────────────────────────────────────────────────────────── */

/**
 * Add a habit to a template, inserted at the position its TIME implies rather
 * than appended. A routine is a sequence through a day; dropping an 06:30 step
 * at the bottom of the evening and making the user drag it up seven places is
 * busywork the clock can do. Untimed habits go to the end.
 *
 * REPEATS ARE ALLOWED. v2 returned the routine unchanged if the habit was
 * already in the template, which is what made "water, four times a day"
 * impossible — see (A) in the header. Anything that needs "is it already here?"
 * asks `habitCountIn`.
 *
 * Waits are ignored when working out the position — they belong to the gap they
 * were placed in, not to a clock time.
 */
export function addHabitStep(routine, templateId, habitId, opts = {}) {
  const tpl = getTemplate(routine, templateId)
  if (!tpl) return routine
  const habit = getHabit(routine, habitId)
  if (!habit) return routine

  const time = opts.time !== undefined ? opts.time : null
  const step = { id: newId('step'), kind: 'habit', habitId, time }
  const key = timeKeyOf(effectiveTime(step, habit))

  let at = tpl.steps.length
  if (opts.at != null) {
    at = Math.max(0, Math.min(tpl.steps.length, opts.at))
  } else {
    for (let i = 0; i < tpl.steps.length; i++) {
      const s = tpl.steps[i]
      if (s.kind !== 'habit') continue
      // UNTIMED STEPS ARE TRANSPARENT to this scan, and that matters now that
      // untimed is the norm. They sit where the user dragged them, so a timed
      // habit must not leapfrog them: adding "Sleep, 23:00" to a hand-arranged
      // morning stack was landing it at position 0, because every untimed step
      // sorts as +∞ and therefore counted as "later than 23:00".
      const existing = timeKeyOf(effectiveTime(s, getHabit(routine, s.habitId)))
      if (existing === Infinity) continue
      if (existing > key) { at = i; break }
    }
  }

  const steps = [...tpl.steps]
  steps.splice(at, 0, step)
  return upsertTemplate(routine, { ...tpl, steps })
}

/** Insert a wait. `at` is the index it lands at; default is the end. */
export function addWaitStep(routine, templateId, minutes = 10, note = '', at = null) {
  const tpl = getTemplate(routine, templateId)
  if (!tpl) return routine
  const step = { id: newId('wait'), kind: 'wait', minutes, note }
  const steps = [...tpl.steps]
  steps.splice(at == null ? steps.length : at, 0, step)
  return upsertTemplate(routine, { ...tpl, steps })
}

export function updateStep(routine, templateId, stepId, patch) {
  const tpl = getTemplate(routine, templateId)
  if (!tpl) return routine
  return upsertTemplate(routine, {
    ...tpl,
    steps: tpl.steps.map(s => (s.id === stepId ? { ...s, ...patch } : s)),
  })
}

export function removeStep(routine, templateId, stepId) {
  const tpl = getTemplate(routine, templateId)
  if (!tpl) return routine
  return upsertTemplate(routine, { ...tpl, steps: tpl.steps.filter(s => s.id !== stepId) })
}

export function moveStep(routine, templateId, stepId, dir) {
  const tpl = getTemplate(routine, templateId)
  if (!tpl) return routine
  const at = tpl.steps.findIndex(s => s.id === stepId)
  const to = at + dir
  if (at < 0 || to < 0 || to >= tpl.steps.length) return routine
  const steps = [...tpl.steps]
  ;[steps[at], steps[to]] = [steps[to], steps[at]]
  return upsertTemplate(routine, { ...tpl, steps })
}

/**
 * Put a habit on exactly this set of weekdays, by adding it to the template
 * each of those days runs and removing it from the rest.
 *
 * This is the bridge between how habits are CREATED ("which days?") and how the
 * week is actually MODELLED (templates). It has one consequence worth stating
 * out loud, and the UI does state it: two weekdays sharing a template cannot
 * differ. Ticking Monday when Monday and Wednesday both run "Gym day" puts the
 * habit on Wednesday too. Splitting them means a second template.
 *
 * REPEATS SURVIVE IT. A template already holding the habit four times is left
 * alone rather than trimmed to one — this function's job is which DAYS, and
 * silently deleting three of the four glasses of water is not that.
 */
export function setHabitDays(routine, habitId, days) {
  let next = routine
  const wanted = new Set()
  for (const d of days) { const id = next.week[d]; if (id) wanted.add(id) }

  for (const tpl of next.templates) {
    const count = habitCountIn(tpl, habitId)
    if (wanted.has(tpl.id) && count === 0) next = addHabitStep(next, tpl.id, habitId)
    else if (!wanted.has(tpl.id) && count > 0) {
      const t = getTemplate(next, tpl.id)
      next = upsertTemplate(next, {
        ...t,
        steps: t.steps.filter(s => !(s.kind === 'habit' && s.habitId === habitId)),
      })
    }
  }
  return next
}

/* ── Library dedupe ──────────────────────────────────────────────────────────
   A ONE-TIME CLEANUP, NOT A FEATURE. It runs once per device behind the
   `settings.libraryDeduped` latch and never again; creating two habits with the
   same name afterwards is allowed and is nobody's business but the user's.

   WHAT IT IS ACTUALLY CLEANING UP. The shipped library carries the same item
   twice under two ids — `sk_am_cleanse`/`sk_pm_cleanse`, `sk_am_ha`/`sk_pm_ha`,
   `sk_am_lub`/`sk_pm_lub` — because v2 could not put one habit in a day twice.
   The duplicates ARE the workaround for the limit that (A) removed, so this
   only became safe in the same version that removed it.

   TWO HABITS MERGE ONLY IF THEY AGREE ON NAME **AND** CATEGORY. Name alone
   would fold a "Walk" under Leisure into a "Walk" under Workout, and the
   category is the one thing that says they are different activities.

   The survivor is the FIRST occurrence, so ids stay stable and the earlier one
   in the library wins. Everything the loser knew that the survivor did not — a
   detail line, a warning, a duration, a glyph — is carried across rather than
   dropped, because the loser is frequently the more completely filled in of the
   two.

   Its clock time is NOT carried across. It moves onto the STEPS the loser
   occupied (see (C)), which is the whole reason those steps keep their
   06:30-vs-22:00 distinction after the merge.

   Returns `{ routine, merges, rewrites }` — `rewrites` maps each removed habit
   id to the step ids it became, per template, so the caller can carry logged
   history across. Dropping that history is the one outcome this must not have.
*/
const dedupeKey = h => `${h.name.trim().toLowerCase().replace(/\s+/g, ' ')} ${h.categoryId}`

export function findDuplicateHabits(routine) {
  const groups = new Map()
  for (const h of routine.habits) {
    const k = dedupeKey(h)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(h)
  }
  return [...groups.values()].filter(g => g.length > 1)
}

export function dedupeLibrary(routine) {
  const dupes = findDuplicateHabits(routine)
  if (!dupes.length) return { routine, merges: [], rewrites: {} }

  const canonicalOf = new Map()   // removed habit id → surviving habit id
  const mergedById = new Map()
  const merges = []
  const dropped = new Set()

  for (const group of dupes) {
    const [keep, ...rest] = group
    let merged = { ...keep }
    for (const loser of rest) {
      canonicalOf.set(loser.id, keep.id)
      dropped.add(loser.id)
      merged = {
        ...merged,
        detail:   merged.detail   || loser.detail   || '',
        warn:     merged.warn     || loser.warn     || '',
        icon:     merged.icon     || loser.icon     || '',
        duration: merged.duration || loser.duration || 0,
        remind:   merged.remind ?? loser.remind ?? null,
      }
    }
    merges.push({ kept: merged.id, removed: rest.map(h => h.id), name: merged.name })
    mergedById.set(merged.id, merged)
  }

  // Everything untouched keeps its position; a merged survivor takes the place
  // of its first occurrence, so the library does not reshuffle under the user.
  const nextHabits = routine.habits
    .filter(h => !dropped.has(h.id))
    .map(h => mergedById.get(h.id) || h)

  /* Rewrite the templates. A step pointing at a removed habit now points at the
     survivor and PINS the removed habit's clock time onto itself, which is what
     keeps the two occurrences distinguishable after the merge. */
  const rewrites = {}
  const templates = routine.templates.map(tpl => ({
    ...tpl,
    steps: tpl.steps.map(s => {
      if (s.kind !== 'habit') return s
      const canonical = canonicalOf.get(s.habitId)
      if (!canonical || canonical === s.habitId) return s

      const loser = routine.habits.find(h => h.id === s.habitId)
      const survivor = mergedById.get(canonical)
      const inherited = s.time != null ? s.time : (loser?.time || '')
      const pinned = inherited !== (survivor?.time || '') ? inherited : s.time

      ;(rewrites[s.habitId] ||= []).push({ templateId: tpl.id, stepId: s.id })
      return { ...s, habitId: canonical, time: pinned }
    }),
  }))

  return { routine: { ...routine, habits: nextHabits, templates }, merges, rewrites }
}

/* ── Validation ──────────────────────────────────────────────────────────────
   A routine can arrive from a backup file: malformed, hand-edited, or from a
   schema that does not exist yet. Everything downstream assumes the shape is
   sound, so it is made sound exactly once, here. */

export function normaliseRoutine(input, fallback) {
  if (!input || typeof input !== 'object') return fallback
  if (input.version === 1 || (input.tasks && input.blocks)) return migrateV1(input, fallback)

  const str = (v, d = '') => (typeof v === 'string' ? v : d)
  const hex = v => (/^#[0-9a-f]{6}$/i.test(v) ? v : PALETTE[0])
  const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d)

  const categories = (Array.isArray(input.categories) ? input.categories : [])
    .filter(c => c && typeof c.id === 'string')
    .map(c => ({ id: c.id, label: str(c.label, 'Untitled').slice(0, 40), color: hex(c.color) }))
  if (!categories.length) return fallback

  const catIds = new Set(categories.map(c => c.id))
  const seen = new Set()
  const habits = (Array.isArray(input.habits) ? input.habits : [])
    .filter(h => {
      if (!h || typeof h.id !== 'string' || !h.name || seen.has(h.id)) return false
      seen.add(h.id); return true
    })
    .map(h => ({
      id: h.id,
      name: str(h.name).slice(0, 120),
      detail: str(h.detail).slice(0, 400),
      time: parseTime(h.time) ? h.time : '',
      categoryId: catIds.has(h.categoryId) ? h.categoryId : categories[0].id,
      remind: h.remind == null ? null : num(h.remind, 0, 120, 10),
      warn: str(h.warn).slice(0, 200),
      // v2 documents have neither, and both are optional by design: '' means
      // "no glyph picked, fall back to the category's" and 0 means "no duration
      // recorded". Neither is an error to be defaulted away.
      icon: str(h.icon).slice(0, 40),
      duration: num(h.duration, 0, 1440, 0),
    }))

  const habitIds = new Set(habits.map(h => h.id))
  const templates = (Array.isArray(input.templates) ? input.templates : [])
    .filter(t => t && typeof t.id === 'string')
    .map(t => {
    /* Step ids are deduped PER TEMPLATE, not across the document. A step is
       addressed as (template, step), so two templates may legitimately reuse an
       id — and the shipped seed did exactly that, at which point a global dedupe
       silently deleted 12 of one template's 17 steps on load.

       IT IS NOT A DEDUPE OF HABIT IDS. The same habitId appearing four times in
       one template is the point of v3; only the STEP ids have to differ. */
    const stepSeen = new Set()
    return {
      id: t.id,
      title: str(t.title, 'Untitled').slice(0, 40),
      color: hex(t.color),
      rest: !!t.rest,
      steps: (Array.isArray(t.steps) ? t.steps : [])
        .filter(s => {
          if (!s || typeof s.id !== 'string' || stepSeen.has(s.id)) return false
          if (s.kind === 'habit' && !habitIds.has(s.habitId)) return false
          if (s.kind !== 'habit' && s.kind !== 'wait') return false
          stepSeen.add(s.id); return true
        })
        .map(s => s.kind === 'wait'
          ? { id: s.id, kind: 'wait', minutes: num(s.minutes, 0, 1440, 10), note: str(s.note).slice(0, 120) }
          : {
              id: s.id, kind: 'habit', habitId: s.habitId,
              // null inherits; '' is a deliberate "no time here". Anything else
              // that is not a valid clock time collapses to INHERIT rather than
              // to '', because '' would silently strip the habit's own time.
              time: s.time == null ? null : (parseTime(s.time) ? s.time : (s.time === '' ? '' : null)),
            }),
    }
  })

  const tplIds = new Set(templates.map(t => t.id))
  const week = ALL_DAYS.map(d => {
    const id = Array.isArray(input.week) ? input.week[d] : null
    return tplIds.has(id) ? id : null
  })

  // A colour on a day with no template is dropped: it would be invisible now
  // and would reappear on whatever template lands there later.
  const weekColor = ALL_DAYS.map(d => {
    const c = Array.isArray(input.weekColor) ? input.weekColor[d] : null
    return week[d] && /^#[0-9a-f]{6}$/i.test(c) ? c : null
  })

  return { version: 3, categories, habits, templates, week, weekColor }
}

/* ── v1 → v3 ─────────────────────────────────────────────────────────────────
   The migration that stops eight months of history from orphaning.

   HABIT IDS ARE THE v1 TASK IDS, UNCHANGED. That is the whole contract: a day
   logged as `{ sk_am_spf: true }` in 2026 still reads as "sunscreen done" after
   this runs — and after the move to step-keyed completion, because
   `stepDoneIn` resolves a habit id against the first step that uses it.

   The shape change is real, though. v1 scheduled by OVERLAPPING day types, v3
   by one template per weekday — so the migration works forwards from the only
   thing both agree on: what each of the seven weekdays actually contained.
   It replays v1's rules per weekday, then folds identical days into one shared
   template, which is exactly how Mon/Wed/Fri end up on a single "Gym day"
   rather than three copies.

   v1's `wait` was free text on the task BEFORE the gap ("Wait 5–10 min before
   next step"). v3 makes it a step of its own, so each one becomes a wait
   inserted after its habit, with the first number in the string as its length.

   It emits a v3 document directly rather than a v2 one that is then upgraded:
   the two upgrades touch the same fields, and running them in sequence means
   two places to keep the id contract in. */
function migrateV1(v1, fallback) {
  try {
    const tags = Array.isArray(v1.tags) ? v1.tags : []
    const tasks = Array.isArray(v1.tasks) ? v1.tasks : []
    const blocks = Array.isArray(v1.blocks) ? v1.blocks : []
    const dayTypes = Array.isArray(v1.dayTypes) ? v1.dayTypes : []
    if (!tasks.length) return fallback

    // Tags → categories, keeping ids so nothing else has to be rewritten.
    const categories = tags.map((t, i) => ({
      id: t.id,
      label: t.label || 'Untitled',
      color: PALETTE[i % PALETTE.length],
    }))
    if (!categories.length) categories.push({ id: 'general', label: 'General', color: PALETTE[0] })

    const blockStart = new Map(blocks.map(b => [b.id, b.start]))
    const blockRemind = new Map(blocks.map(b => [b.id, b.remind]))

    /* ONLY THE FIRST TASK OF EACH BLOCK KEEPS A TIME.
       A v1 task had no time of its own — it inherited its BLOCK's start, which
       meant "the morning starts at 06:30", not "this step happens at 06:30".
       The first migration handed that same time to every task in the block, so
       a six-step morning arrived as six habits all claiming 06:30: times that
       never existed in v1, on a screen that now treats a time as a deliberate
       choice.

       Giving it to the first task alone preserves exactly what v1 actually had
       — one reminder per block, at the block's start — and leaves the rest as
       the stack they always were. */
    const seenBlock = new Set()
    const habits = tasks.map(t => {
      const isBlockOpener = !seenBlock.has(t.block)
      seenBlock.add(t.block)
      return {
        id: t.id,                                 // ← THE CONTRACT
        name: t.name,
        detail: t.detail || '',
        time: isBlockOpener ? (blockStart.get(t.block) || '') : '',
        categoryId: categories.find(c => (t.tags || []).includes(c.id))?.id || categories[0].id,
        remind: isBlockOpener ? (blockRemind.get(t.block) ?? null) : null,
        warn: t.warn || '',
        icon: '',
        duration: 0,
      }
    })

    // Replay v1's scheduling for each weekday.
    const ranOn = (task, d) => {
      if ((task.days || []).includes(d)) return true
      return (task.dayTypes || []).some(id => dayTypes.find(x => x.id === id)?.days?.includes(d))
    }
    const blockRank = new Map(blocks.map((b, i) => [b.id, i]))
    const orderFor = d => tasks
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => ranOn(t, d))
      .sort((a, b) => (blockRank.get(a.t.block) ?? 99) - (blockRank.get(b.t.block) ?? 99) || a.i - b.i)
      .map(({ t }) => t)

    const templates = []
    const week = ALL_DAYS.map(() => null)
    const bySignature = new Map()

    for (const d of ALL_DAYS) {
      const dayTasks = orderFor(d)
      if (!dayTasks.length) continue
      const signature = dayTasks.map(t => t.id).join('|')

      if (bySignature.has(signature)) { week[d] = bySignature.get(signature); continue }

      const steps = []
      for (const t of dayTasks) {
        steps.push({ id: newId('step'), kind: 'habit', habitId: t.id, time: null })
        if (t.wait) {
          const n = parseInt(String(t.wait).match(/\d+/)?.[0] || '0', 10)
          if (n > 0) steps.push({ id: newId('wait'), kind: 'wait', minutes: n, note: t.wait })
        }
      }

      // Name it after whichever v1 day type best described that weekday — the
      // same string the badge used to show, so the week still reads familiar.
      const match = dayTypes.filter(x => x.days?.length < 7 && x.days?.includes(d))
      const tpl = {
        id: newId('tpl'),
        title: match[0]?.name || DAY_LABELS[d],
        color: PALETTE[templates.length % PALETTE.length],
        rest: false,
        steps,
      }
      templates.push(tpl)
      bySignature.set(signature, tpl.id)
      week[d] = tpl.id
    }

    if (!templates.length) return fallback
    return { version: 3, categories, habits, templates, week, weekColor: ALL_DAYS.map(() => null) }
  } catch {
    return fallback
  }
}

/* ── Carrying history across the dedupe ──────────────────────────────────────
   Lives here rather than in store.jsx because it is a pure transform over data,
   and because `verify.mjs` runs under plain node — anything it asserts has to
   sit outside the file that imports React.

   The one thing the dedupe must not do is lose history, and deleting a habit id
   that eight months of day logs are keyed by is exactly how it would.

   HOW A TICK FINDS ITS NEW HOME. `rewrites` says which step ids each removed
   habit became, per template. A logged day knows its weekday, the weekday knows
   its template, and the template picks one of those steps — so
   `{ sk_pm_cleanse: true }` on a Wednesday lands on the Gym day's evening
   cleanse step and not on its morning one.

   WHEN IT CANNOT TELL, IT FALLS BACK RATHER THAN DROPS. A day whose template
   has since been reassigned or deleted has no step to land on. Those ticks are
   re-keyed to the SURVIVING habit id, which `stepDoneIn` still resolves against
   the first occurrence — less precise than a step id, and precisely as good as
   what that day had before this ran. Dropping them would be the only outcome
   worse than doing nothing at all. */
export function rewriteCheckedIds(items, routine, merges, rewrites, stamp = () => new Date().toISOString()) {
  if (!merges.length) return items

  const canonicalOf = new Map()
  for (const m of merges) for (const id of m.removed) canonicalOf.set(id, m.kept)

  return items.map(item => {
    const keys = Object.keys(item.checked || {})
    if (!keys.some(k => canonicalOf.has(k))) return item

    // Noon, like everywhere else that turns a date key back into a Date —
    // midnight plus a DST shift lands on the previous day and would read the
    // wrong template. See dates.js.
    const jsDay = new Date(`${item.id}T12:00:00`).getDay()
    const tplId = routine.week?.[jsDay]

    const checked = {}
    for (const k of keys) {
      if (!canonicalOf.has(k)) { checked[k] = true; continue }
      const hit = (rewrites[k] || []).find(t => t.templateId === tplId)
      checked[hit ? hit.stepId : canonicalOf.get(k)] = true
    }
    return { ...item, checked, updatedAt: stamp() }
  })
}
