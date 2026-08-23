/* ============================================================================
   ROUTINE — the engine. Pure functions over a routine document. SCHEMA v2.
   ============================================================================
   v1 modelled the protocol the way the ORIGINAL protocol happened to be shaped:
   tasks lived in fixed time blocks, and overlapping "day types" decided which
   days each one ran. That worked for one specific skincare-and-supplements
   week and fought everything else. v2 drops it.

   THE DOCUMENT

     routine = {
       version: 2,
       categories: [{ id, label, color }],    what KIND of thing a habit is
       habits:     [{ id, name, detail, time, categoryId, remind, warn }],
       templates:  [{ id, title, color, steps: [Step] }],
       week:       [t0 … t6],                 weekday → template id (or null)
     }

     Step = { id, kind: 'habit', habitId }
          | { id, kind: 'wait',  minutes, note }

   THE THREE IDEAS, AND WHY THEY ARE SEPARATE

   1. A HABIT is a thing you do — a name, a category, and the time of day it
      belongs at. It knows nothing about which days it happens on. That is what
      makes it reusable: "Creatine" is one habit whether it appears on three
      days or seven.

   2. A TEMPLATE is a named day — a mood ("Gym day", "Slow Sunday"), a colour,
      and an ORDERED list of steps. The order is the point: it is the sequence
      you actually move through, and WAITS ARE STEPS IN IT rather than a note
      attached to the habit before them. A wait is a real thing that occupies
      real time, and modelling it as a field meant it could never sit between
      two habits without belonging to one of them.

   3. THE WEEK is seven slots, each pointing at a template. Mon/Wed/Fri sharing
      one "Gym day" is the whole reason templates exist — configure once, edit
      once. Two weekdays that need to differ need two templates; that is the
      deliberate cost of not having per-day overrides.

   WHAT THIS REPLACED, AND THE ONE RULE THAT SURVIVED
   v1's overlapping day types existed to express "Sunday is active but has no
   workout" — two independent flags that could not be collapsed into one enum.
   v2 has no flags to collapse: a Sunday is simply a template whose steps are
   the ones Sunday has. The constraint is gone rather than solved.

   TASK IDS ARE STILL A STORAGE CONTRACT. Completion persists as
   `{ [habitId]: true }` per day, going back to the GitHub Pages build. The v1
   migration carries every task id across UNCHANGED — `habit.id` is the same
   string `task.id` was — so history keeps lining up. Never rename or reuse one.
   ========================================================================== */

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

/** Monday-first, for every day picker in the UI. */
export const DAY_ORDER  = [1, 2, 3, 4, 5, 6, 0]
export const DAY_SHORT  = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday',
                           'Thursday', 'Friday', 'Saturday']

/* ── Colour ──────────────────────────────────────────────────────────────────
   Categories and templates carry a LITERAL hex, not one of the kit's semantic
   tones. That is a deliberate exception to "semantic names, never colour
   names", and it is the same exception the kit already makes for Budget's
   account colours: a category's colour means nothing — it is identity, chosen
   by the user, with no status to encode. `colorUtils.getContrastText` picks the
   ink, so any colour added here stays readable without a second measurement.

   Chosen bright, because they are solid fills on a near-black page. */
export const PALETTE = [
  '#C5DE6B', // lime
  '#F5C542', // amber
  '#FF7A5C', // coral
  '#7FD1E8', // sky
  '#C89BFF', // violet
  '#5FD9A6', // mint
  '#FF9ECF', // pink
  '#FFB067', // tangerine
]

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
 * A day's steps, resolved: every step carries the habit and category it points
 * at, so a screen never has to look them up itself.
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
    out.push({ ...step, habit, category: getCategory(routine, habit.categoryId) })
  }
  return out
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

/** A habit no template uses. Not an error — it is a habit you have not put in
 *  a day yet — but the editor has to say so, or it silently never appears. */
export function isUnusedHabit(routine, habitId) {
  return templatesWithHabit(routine, habitId).length === 0
}

/** The day's badge and title, from its template. */
export function dayKindFor(routine, jsDay) {
  const tpl = templateForDay(routine, jsDay)
  if (!tpl) return { text: 'OPEN', label: 'Nothing planned', color: null, template: null }
  return { text: tpl.title.toUpperCase(), label: tpl.title, color: tpl.color, template: tpl }
}

/** Today's habit steps bucketed by category, for the Overview breakdown. */
export function stepsByCategory(routine, steps, checked = {}) {
  const habits = steps.filter(s => s.kind === 'habit')
  return routine.categories
    .map(cat => {
      const mine = habits.filter(s => s.habit.categoryId === cat.id)
      return { category: cat, total: mine.length, done: mine.filter(s => checked[s.habitId]).length }
    })
    .filter(x => x.total > 0)
}

/** Total minutes a day's waits ask you to stand around for. */
export function totalWaitMinutes(steps) {
  return steps.filter(s => s.kind === 'wait').reduce((n, s) => n + (s.minutes || 0), 0)
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

/** "45 min", "1 h", "1 h 30". Waits are read at a glance, not parsed. */
export function formatWait(minutes) {
  const m = Math.max(0, Math.round(minutes || 0))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} h ${rest}` : `${h} h`
}

/** Sort key for a habit step: its time, or +∞ so untimed habits sink. */
const timeKey = habit => {
  const t = parseTime(habit?.time)
  return t ? t.hour * 60 + t.min : Infinity
}

/* ── Notifications ───────────────────────────────────────────────────────────
   Derived from the habits themselves now, not from time blocks. A habit with a
   time and a `remind` fires that many minutes before, on exactly the weekdays
   its templates are assigned to. Habits sharing a fire time are merged into one
   notification, because three separate buzzes at 06:20 is three chances to
   dismiss the whole morning. */
export function notifScheduleFor(routine) {
  const bucket = new Map()

  for (const habit of routine.habits) {
    const t = parseTime(habit.time)
    if (!t || habit.remind == null) continue

    const days = habitDays(routine, habit.id)
    if (!days.length) continue

    // Clamp rather than wrap: a reminder for a 00:05 habit belongs at midnight
    // that morning, not at 23:55 the evening before, where `days` would then be
    // pointing at the wrong day entirely.
    const at = Math.max(0, t.hour * 60 + t.min - habit.remind)
    const key = `${at}`

    if (!bucket.has(key)) bucket.set(key, { at, habits: [], days: new Set() })
    const b = bucket.get(key)
    b.habits.push(habit)
    for (const d of days) b.days.add(d)
  }

  return [...bucket.values()]
    .sort((a, b) => a.at - b.at)
    .map(b => ({
      id: `at-${b.at}`,
      hour: Math.floor(b.at / 60),
      min: b.at % 60,
      title: b.habits.length === 1
        ? `${b.habits[0].name} soon`
        : `${b.habits.length} things coming up`,
      body: b.habits.map(h => h.name).join(' → '),
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

/** Deleting a template also frees every weekday pointing at it. */
export function removeTemplate(routine, tplId) {
  return {
    ...routine,
    templates: routine.templates.filter(t => t.id !== tplId),
    week: routine.week.map(id => (id === tplId ? null : id)),
  }
}

/** Point one weekday at a template (or at nothing). */
export function assignDay(routine, jsDay, templateId) {
  const week = [...routine.week]
  week[jsDay] = templateId || null
  return { ...routine, week }
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
 * Waits are ignored when working out the position — they belong to the gap they
 * were placed in, not to a clock time.
 */
export function addHabitStep(routine, templateId, habitId) {
  const tpl = getTemplate(routine, templateId)
  if (!tpl) return routine
  if (tpl.steps.some(s => s.kind === 'habit' && s.habitId === habitId)) return routine

  const key = timeKey(getHabit(routine, habitId))
  const step = { id: newId('step'), kind: 'habit', habitId }

  let at = tpl.steps.length
  for (let i = 0; i < tpl.steps.length; i++) {
    const s = tpl.steps[i]
    if (s.kind !== 'habit') continue
    // UNTIMED STEPS ARE TRANSPARENT to this scan, and that matters now that
    // untimed is the norm. They sit where the user dragged them, so a timed
    // habit must not leapfrog them: adding "Sleep, 23:00" to a hand-arranged
    // morning stack was landing it at position 0, because every untimed step
    // sorts as +∞ and therefore counted as "later than 23:00".
    const existing = timeKey(getHabit(routine, s.habitId))
    if (existing === Infinity) continue
    if (existing > key) { at = i; break }
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
 */
export function setHabitDays(routine, habitId, days) {
  let next = routine
  const wanted = new Set()
  for (const d of days) { const id = next.week[d]; if (id) wanted.add(id) }

  for (const tpl of next.templates) {
    const has = tpl.steps.some(s => s.kind === 'habit' && s.habitId === habitId)
    if (wanted.has(tpl.id) && !has) next = addHabitStep(next, tpl.id, habitId)
    else if (!wanted.has(tpl.id) && has) {
      const t = getTemplate(next, tpl.id)
      next = upsertTemplate(next, {
        ...t,
        steps: t.steps.filter(s => !(s.kind === 'habit' && s.habitId === habitId)),
      })
    }
  }
  return next
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
    }))

  const habitIds = new Set(habits.map(h => h.id))
  const templates = (Array.isArray(input.templates) ? input.templates : [])
    .filter(t => t && typeof t.id === 'string')
    .map(t => {
    /* Step ids are deduped PER TEMPLATE, not across the document. A step is
       addressed as (template, step), so two templates may legitimately reuse an
       id — and the shipped seed did exactly that, at which point a global dedupe
       silently deleted 12 of one template's 17 steps on load. */
    const stepSeen = new Set()
    return {
      id: t.id,
      title: str(t.title, 'Untitled').slice(0, 40),
      color: hex(t.color),
      steps: (Array.isArray(t.steps) ? t.steps : [])
        .filter(s => {
          if (!s || typeof s.id !== 'string' || stepSeen.has(s.id)) return false
          if (s.kind === 'habit' && !habitIds.has(s.habitId)) return false
          if (s.kind !== 'habit' && s.kind !== 'wait') return false
          stepSeen.add(s.id); return true
        })
        .map(s => s.kind === 'wait'
          ? { id: s.id, kind: 'wait', minutes: num(s.minutes, 0, 1440, 10), note: str(s.note).slice(0, 120) }
          : { id: s.id, kind: 'habit', habitId: s.habitId }),
    }
  })

  const tplIds = new Set(templates.map(t => t.id))
  const week = ALL_DAYS.map(d => {
    const id = Array.isArray(input.week) ? input.week[d] : null
    return tplIds.has(id) ? id : null
  })

  return { version: 2, categories, habits, templates, week }
}

/* ── v1 → v2 ─────────────────────────────────────────────────────────────────
   The migration that stops eight months of history from orphaning.

   HABIT IDS ARE THE v1 TASK IDS, UNCHANGED. That is the whole contract: a day
   logged as `{ sk_am_spf: true }` in 2026 still reads as "sunscreen done" after
   this runs.

   The shape change is real, though. v1 scheduled by OVERLAPPING day types, v2
   by one template per weekday — so the migration works forwards from the only
   thing both agree on: what each of the seven weekdays actually contained. It
   replays v1's rules per weekday, then folds identical days into one shared
   template, which is exactly how Mon/Wed/Fri end up on a single "Gym day"
   rather than three copies.

   v1's `wait` was free text on the task BEFORE the gap ("Wait 5–10 min before
   next step"). v2 makes it a step of its own, so each one becomes a wait
   inserted after its habit, with the first number in the string as its length. */
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
    const blockFirst = new Set()
    for (const t of tasks) if (!blockFirst.has(t.block)) blockFirst.add(t.block)
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
        steps.push({ id: newId('step'), kind: 'habit', habitId: t.id })
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
        steps,
      }
      templates.push(tpl)
      bySignature.set(signature, tpl.id)
      week[d] = tpl.id
    }

    if (!templates.length) return fallback
    return { version: 2, categories, habits, templates, week }
  } catch {
    return fallback
  }
}
