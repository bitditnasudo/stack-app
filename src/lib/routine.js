/* ============================================================================
   ROUTINE — the engine. Pure functions over a routine document.
   ============================================================================
   STACK used to hardcode the protocol in `buildTasks()`. It is now DATA the
   user edits, stored alongside the day logs, and this file is everything that
   reads or rewrites that data. `protocol.js` holds only the seed.

   THE DOCUMENT

     routine = { version, dayTypes[], tags[], blocks[], tasks[] }

   DAY TYPES ARE OVERLAPPING LABELS, NOT AN ENUM.
   A weekday belongs to as many day types as match it. This is load-bearing:
   the original protocol had two INDEPENDENT flags — "active" (retinoid /
   vitamin C nights: Sun Mon Wed Fri Sat) and "workout" (Mon Wed Fri Sat) — and
   Sunday is active with no workout. Collapsing day types into one exclusive
   "what kind of day is it" field would make Sunday unrepresentable. It was the
   most bug-prone corner of the old file, and the schema now prevents the bug
   rather than warning about it.

   A TASK'S DAYS ARE A UNION:
     union( days of every dayType it names , its own explicit `days` )
   Day types cover the normal case ("every active day"); the explicit list is
   the escape hatch for a one-off pairing that deserves no name.

   TASK IDS ARE STILL A STORAGE CONTRACT. Completion persists as
   `{ [taskId]: true }` per day, so a renamed id silently orphans history —
   including the history imported from the old GitHub Pages build. `newId()`
   mints ids that are unique for all time; nothing here ever rewrites one, and
   deleting a task deliberately leaves its past ticks in place (a day log also
   stores its own `total`, so old percentages stay correct).
   ========================================================================== */

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

/** Monday-first, for every day picker in the UI — the week starts Monday here
 *  exactly as it does in the recap grid. */
export const DAY_ORDER  = [1, 2, 3, 4, 5, 6, 0]
export const DAY_SHORT  = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday',
                           'Thursday', 'Friday', 'Saturday']

/** The kit's semantic tones. Never a colour name — see the house rules. */
export const TONES = ['brand', 'info', 'ok', 'warn', 'danger', 'neutral']

/* ── Ids ────────────────────────────────────────────────────────────────────
   Prefixed so a stray id in a backup is still readable, and built from the
   clock plus randomness so two devices editing offline cannot collide. */
let idCounter = 0
export function newId(prefix = 'x') {
  idCounter = (idCounter + 1) % 4096
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 6)
  return `${prefix}_${t}${r}${idCounter.toString(36)}`
}

/* ── Reading ─────────────────────────────────────────────────────────────── */

const byId = (list, id) => list.find(x => x.id === id) || null

export const getBlock   = (routine, id) => byId(routine.blocks, id)
export const getTag     = (routine, id) => byId(routine.tags, id)
export const getDayType = (routine, id) => byId(routine.dayTypes, id)

/** Every weekday a task occurs on, as a sorted array of JS day indices. */
export function taskDays(routine, task) {
  const set = new Set(task.days || [])
  for (const id of task.dayTypes || []) {
    const dt = getDayType(routine, id)
    if (dt) for (const d of dt.days) set.add(d)
  }
  return [...set].sort()
}

export function taskRunsOn(routine, task, jsDay) {
  if ((task.days || []).includes(jsDay)) return true
  return (task.dayTypes || []).some(id => getDayType(routine, id)?.days.includes(jsDay))
}

/** A task nobody scheduled. Not an error — a half-finished edit — but the
 *  editor has to say so, because it silently never appears on Today. */
export function isUnscheduled(routine, task) {
  return taskDays(routine, task).length === 0
}

/**
 * The day's checklist, in screen order: blocks in `blocks` order, tasks in
 * `tasks` order within each block. A task whose block was deleted out from
 * under it sorts to the end rather than disappearing.
 */
export function tasksForDay(routine, jsDay) {
  const due = routine.tasks.filter(t => taskRunsOn(routine, t, jsDay))
  const rank = new Map(routine.blocks.map((b, i) => [b.id, i]))
  return due
    .map((t, i) => ({ t, b: rank.has(t.block) ? rank.get(t.block) : Infinity, i }))
    .sort((a, b) => (a.b - b.b) || (a.i - b.i))
    .map(x => x.t)
}

export function tasksForDate(routine, d = new Date()) {
  return tasksForDay(routine, d.getDay())
}

/**
 * Which named day types apply today.
 *
 * A type covering all seven days is excluded: "Every day" is true of every day,
 * so as a badge it says nothing about *this* one. It still schedules tasks
 * perfectly well — it is only hidden from the label.
 */
export function dayTypesForDay(routine, jsDay) {
  return routine.dayTypes.filter(dt => dt.days.length < 7 && dt.days.includes(jsDay))
}

/**
 * The day's badge and title. `text` is the chip, `label` the page title.
 * The first matching type wins the chip, so the ORDER of `dayTypes` is the
 * priority order — moving "Gym" above "Active" is how a Monday reads GYM
 * rather than ACTIVE. The editor says so next to the reorder controls.
 */
export function dayKindFor(routine, jsDay) {
  const types = dayTypesForDay(routine, jsDay)
  if (!types.length) return { text: 'DAY', tone: 'neutral', label: 'Today', types }
  return {
    text:  types[0].name.toUpperCase(),
    tone:  types[0].tone || 'neutral',
    label: types.map(t => t.name).join(' · '),
    types,
  }
}

/** Today's tasks bucketed by tag, for the Overview breakdown. A tag with no
 *  task today is omitted — an empty "Habits 0/0" bar reads as a failure. */
export function tasksByTag(routine, tasks, checked = {}) {
  return routine.tags
    .map(tag => {
      const mine = tasks.filter(t => (t.tags || []).includes(tag.id))
      return { tag, total: mine.length, done: mine.filter(t => checked[t.id]).length }
    })
    .filter(x => x.total > 0)
}

/* ── Time ────────────────────────────────────────────────────────────────────
   Block times are stored as 24h "HH:MM" strings and rendered through the
   locale: the data is unambiguous, the display is the user's. */

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

/**
 * "6:30 – 7:00 AM" — the day period is dropped from the start when both ends
 * share it, which is how the original read and how people write a range.
 *
 * The period is found with `formatToParts`, NOT by matching /AM|PM/ on the
 * formatted string. That regex was the first version and it silently did
 * nothing on this phone: the browser's locale renders "6:30 a.m.", which the
 * pattern misses, so every block heading read "6:30 a.m. – 7:00 a.m." Asking
 * Intl which characters are the day period works in every locale, and in a
 * 24-hour one there is no such part, so the range is simply left alone.
 */
export function formatTimeRange(start, end) {
  const a = parseTime(start)
  const b = parseTime(end)
  if (!a) return ''
  if (!b) return formatTime(start)

  const sa = formatTime(start)
  const sb = formatTime(end)
  const pa = dayPeriodOf(a)
  const pb = dayPeriodOf(b)

  // `replace` rather than a trailing trim: plenty of locales put the period
  // FIRST (zh-CN renders "上午6:30"), so its position can't be assumed.
  if (pa && pb && pa === pb) return `${sa.replace(pa, '').trim()} – ${sb}`
  return `${sa} – ${sb}`
}

function dayPeriodOf({ hour, min }) {
  const d = new Date()
  d.setHours(hour, min, 0, 0)
  return new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' })
    .formatToParts(d).find(p => p.type === 'dayPeriod')?.value || null
}

/* ── Notifications ───────────────────────────────────────────────────────────
   Derived, never hand-maintained. The old app kept a second literal list of
   reminders beside the protocol, so adding a step meant remembering to edit
   both — and forgetting was invisible until a reminder read out a stale list.
   A block's reminder now fires `remind` minutes before that block starts, on
   exactly the days the block has tasks, and reads out those tasks.

   `remind: null` means the block is silent. */
export function notifScheduleFor(routine) {
  const out = []

  for (const block of routine.blocks) {
    const start = parseTime(block.start)
    if (!start || block.remind == null) continue

    const tasks = routine.tasks.filter(t => t.block === block.id)
    if (!tasks.length) continue

    const days = new Set()
    for (const t of tasks) for (const d of taskDays(routine, t)) days.add(d)
    if (!days.size) continue

    // Clamp rather than wrap: the reminder for a 00:05 block belongs at midnight
    // that same morning, not at 23:55 the evening before — where `days` would
    // then be pointing at the wrong day entirely.
    const total = Math.max(0, start.hour * 60 + start.min - block.remind)

    out.push({
      id: block.id,
      hour: Math.floor(total / 60),
      min: total % 60,
      title: `${block.label} in ${block.remind} min`,
      body: tasks.map(t => t.name).join(' → '),
      days: [...days].sort(),
    })
  }

  return out.sort((a, b) => (a.hour - b.hour) || (a.min - b.min))
}

/* ── Writing ─────────────────────────────────────────────────────────────────
   All pure: each returns a new routine. The store stamps `routineUpdatedAt`
   around them, so nothing here has to know about persistence. */

const replace = (list, item) =>
  list.some(x => x.id === item.id)
    ? list.map(x => (x.id === item.id ? item : x))
    : [...list, item]

export function upsertTask(routine, task) {
  return { ...routine, tasks: replace(routine.tasks, task) }
}

export function removeTask(routine, id) {
  return { ...routine, tasks: routine.tasks.filter(t => t.id !== id) }
}

/**
 * Move a task one place within its own block. Reordering the flat list by raw
 * index would jump a task over a block boundary and silently re-home it, so the
 * swap is worked out among its block-mates and then applied to the flat array.
 */
export function moveTask(routine, id, dir) {
  const self = routine.tasks.find(t => t.id === id)
  if (!self) return routine

  const mates = routine.tasks.filter(t => t.block === self.block)
  const at = mates.indexOf(self)
  const to = at + dir
  if (to < 0 || to >= mates.length) return routine

  const a = routine.tasks.indexOf(mates[at])
  const b = routine.tasks.indexOf(mates[to])
  const tasks = [...routine.tasks]
  ;[tasks[a], tasks[b]] = [tasks[b], tasks[a]]
  return { ...routine, tasks }
}

export function upsertDayType(routine, dt) {
  return { ...routine, dayTypes: replace(routine.dayTypes, dt) }
}

/** Deleting a day type strips it from every task that named it — leaving the
 *  reference behind would make a task silently unscheduled with no visible
 *  cause. The editor flags any task left with nowhere to run. */
export function removeDayType(routine, id) {
  return {
    ...routine,
    dayTypes: routine.dayTypes.filter(d => d.id !== id),
    tasks: routine.tasks.map(t =>
      (t.dayTypes || []).includes(id)
        ? { ...t, dayTypes: t.dayTypes.filter(x => x !== id) }
        : t),
  }
}

export function moveDayType(routine, id, dir) {
  const at = routine.dayTypes.findIndex(d => d.id === id)
  const to = at + dir
  if (at < 0 || to < 0 || to >= routine.dayTypes.length) return routine
  const dayTypes = [...routine.dayTypes]
  ;[dayTypes[at], dayTypes[to]] = [dayTypes[to], dayTypes[at]]
  return { ...routine, dayTypes }
}

export function upsertTag(routine, tag) {
  return { ...routine, tags: replace(routine.tags, tag) }
}

export function removeTag(routine, id) {
  return {
    ...routine,
    tags: routine.tags.filter(t => t.id !== id),
    tasks: routine.tasks.map(t =>
      (t.tags || []).includes(id) ? { ...t, tags: t.tags.filter(x => x !== id) } : t),
  }
}

export function upsertBlock(routine, block) {
  return { ...routine, blocks: replace(routine.blocks, block) }
}

/**
 * Deleting a block re-homes its tasks into the first surviving block rather
 * than deleting them — losing a step because its heading was removed is not a
 * trade anyone would accept. Refuses to remove the last block: tasks need
 * somewhere to live.
 */
export function removeBlock(routine, id) {
  const rest = routine.blocks.filter(b => b.id !== id)
  if (!rest.length) return routine
  return {
    ...routine,
    blocks: rest,
    tasks: routine.tasks.map(t => (t.block === id ? { ...t, block: rest[0].id } : t)),
  }
}

export function moveBlock(routine, id, dir) {
  const at = routine.blocks.findIndex(b => b.id === id)
  const to = at + dir
  if (at < 0 || to < 0 || to >= routine.blocks.length) return routine
  const blocks = [...routine.blocks]
  ;[blocks[at], blocks[to]] = [blocks[to], blocks[at]]
  return { ...routine, blocks }
}

/* ── Validation ──────────────────────────────────────────────────────────────
   A routine can arrive from a backup file, which means it can arrive malformed,
   hand-edited, or from a schema that doesn't exist yet. Everything that reads a
   routine assumes the shape is sound, so it is MADE sound exactly once, here,
   on the way in — and falls back whole rather than half-repaired if the core of
   it is missing. */

export function normaliseRoutine(input, fallback) {
  if (!input || typeof input !== 'object') return fallback

  const days = v => (Array.isArray(v)
    ? [...new Set(v.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : [])
  const str = (v, d = '') => (typeof v === 'string' ? v : d)
  const ids = (v, valid) => (Array.isArray(v) ? [...new Set(v.filter(x => valid.has(x)))] : [])
  const tone = v => (TONES.includes(v) ? v : 'neutral')

  const dayTypes = (Array.isArray(input.dayTypes) ? input.dayTypes : [])
    .filter(d => d && typeof d.id === 'string')
    .map(d => ({ id: d.id, name: str(d.name, 'Untitled').slice(0, 40), tone: tone(d.tone), days: days(d.days) }))

  const tags = (Array.isArray(input.tags) ? input.tags : [])
    .filter(t => t && typeof t.id === 'string')
    .map(t => ({ id: t.id, label: str(t.label, 'Untitled').slice(0, 40), tone: tone(t.tone) }))

  const blocks = (Array.isArray(input.blocks) ? input.blocks : [])
    .filter(b => b && typeof b.id === 'string')
    .map(b => ({
      id: b.id,
      label: str(b.label, 'Untitled').slice(0, 40),
      start: parseTime(b.start) ? b.start : '',
      end:   parseTime(b.end)   ? b.end   : '',
      remind: Number.isFinite(b.remind) ? Math.max(0, Math.min(120, Math.round(b.remind))) : null,
    }))

  // Without at least one block and one day type there is nothing to hang a task
  // on, and a half-empty routine is worse than the seed.
  if (!blocks.length || !dayTypes.length) return fallback

  const blockIds   = new Set(blocks.map(b => b.id))
  const tagIds     = new Set(tags.map(t => t.id))
  const dayTypeIds = new Set(dayTypes.map(d => d.id))

  const seen = new Set()
  const tasks = (Array.isArray(input.tasks) ? input.tasks : [])
    .filter(t => {
      if (!t || typeof t.id !== 'string' || !t.name || seen.has(t.id)) return false
      seen.add(t.id)
      return true
    })
    .map(t => ({
      id: t.id,
      name: str(t.name).slice(0, 120),
      detail: str(t.detail).slice(0, 400),
      // A task pointing at a block that no longer exists would never render.
      block: blockIds.has(t.block) ? t.block : blocks[0].id,
      tags: ids(t.tags, tagIds),
      dayTypes: ids(t.dayTypes, dayTypeIds),
      days: days(t.days),
      target: str(t.target).slice(0, 120),
      warn: str(t.warn).slice(0, 200),
      wait: str(t.wait).slice(0, 200),
    }))

  return { version: 1, dayTypes, tags, blocks, tasks }
}
