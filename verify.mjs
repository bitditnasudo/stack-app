/* Domain assertions — `node verify.mjs`.
 *
 * Two jobs. The first is the one that has always been here: the shipped
 * protocol still classifies days the way it did, and still uses the fifteen
 * task ids that history is keyed by. The second is new — the routine is data
 * the user edits now, so the ENGINE that reads and rewrites that data has to
 * hold up against edits, not just against the seed. */

import { defaultRoutine } from './src/lib/protocol.js'
import {
  tasksForDay, dayKindFor, dayTypesForDay, taskDays, isUnscheduled,
  notifScheduleFor, normaliseRoutine, formatTimeRange,
  upsertTask, removeTask, moveTask, removeDayType, removeBlock, removeTag,
} from './src/lib/routine.js'
import { getLocalDateKey, getWeekDates, getWeekStartMonday } from './src/lib/dates.js'
import { weekStats } from './src/lib/weeks.js'

let fail = 0
const ok = (c, m) => { if (!c) { console.log('FAIL:', m); fail++ } else console.log('ok  :', m) }

const R = defaultRoutine()
const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const n = d => tasksForDay(R, d).length
const kinds = d => dayTypesForDay(R, d).map(t => t.id)

console.log('\n── the shipped week ─────────────────────────────────────────────')
for (let d = 0; d < 7; d++) {
  console.log(`  ${names[d]}: ${String(n(d)).padStart(2)} tasks   ${dayKindFor(R, d).text.padEnd(9)} [${kinds(d).join(' ')}]`)
}

// ── Day classification: the active/workout split is still the bug-prone bit ──
ok(kinds(0).includes('active') && !kinds(0).includes('gym') && !kinds(0).includes('mobility'),
   'Sunday is ACTIVE but has NO workout')
ok(!kinds(2).includes('active') && !kinds(2).includes('gym'), 'Tuesday is rest, no workout')
ok(kinds(6).includes('mobility') && kinds(6).includes('active'), 'Saturday is the mobility session, and active')
ok(dayKindFor(R, 6).text === 'MOBILITY' && dayKindFor(R, 1).text === 'GYM', 'Sat=MOBILITY, Mon=GYM')
ok(!dayTypesForDay(R, 1).some(t => t.id === 'everyday'),
   'a day type covering all 7 days is never a badge')

// ── Task counts per day type ────────────────────────────────────────────────
ok(n(1) === 15 && n(3) === 15 && n(5) === 15, `Mon/Wed/Fri are 15 tasks (got ${n(1)}/${n(3)}/${n(5)})`)
ok(n(6) === 15, `Sat is 15 tasks (got ${n(6)})`)
ok(n(0) === 12, `Sun is 12 tasks (got ${n(0)})`)
ok(n(2) === 8 && n(4) === 8, `Tue/Thu are 8 tasks (got ${n(2)}/${n(4)})`)

// ── Task ids are the storage contract: unique, and none renamed ─────────────
const EXPECTED = ['sk_am_cleanse', 'sk_am_growth', 'sk_am_vitc', 'sk_am_ha', 'sk_am_lub', 'sk_am_spf',
  'tadalafil', 'ablazor', 'whey', 'creatine', 'sk_pm_cleanse', 'sk_pm_ha', 'sk_pm_retinol', 'sk_pm_min', 'sk_pm_lub']
const all = new Set()
for (let d = 0; d < 7; d++) for (const t of tasksForDay(R, d)) all.add(t.id)
ok([...all].sort().join() === [...EXPECTED].sort().join(),
   'task ids match the legacy set exactly (no orphaned history)')
let dupes = 0
for (let d = 0; d < 7; d++) {
  const ids = tasksForDay(R, d).map(t => t.id)
  if (new Set(ids).size !== ids.length) dupes++
}
ok(dupes === 0, 'no duplicate ids on any day')

// Screen order: blocks in block order, and within a block the array order.
const monIds = tasksForDay(R, 1).map(t => t.id)
ok(monIds[0] === 'sk_am_cleanse' && monIds[monIds.length - 1] === 'sk_pm_lub',
   'Monday runs cleanse-first to moisturiser-last')
const rank = new Map(R.blocks.map((b, i) => [b.id, i]))
const seq = tasksForDay(R, 1).map(t => rank.get(t.block))
ok(seq.every((v, i) => i === 0 || v >= seq[i - 1]), 'tasks never jump backwards through the blocks')

console.log('\n── routine engine ───────────────────────────────────────────────')

// ── A task's days are a UNION of its day types and its own explicit days ────
ok(taskDays(R, R.tasks.find(t => t.id === 'ablazor')).join() === '1,3,5,6',
   'ablazor unions gym + mobility into Mon Wed Fri Sat')
ok(taskDays(R, R.tasks.find(t => t.id === 'sk_am_spf')).length === 7, 'sunscreen is every day')
const hybrid = { ...R.tasks.find(t => t.id === 'ablazor'), days: [2] }
ok(taskDays(R, hybrid).join() === '1,2,3,5,6', 'an explicit day adds to the day types, never replaces them')
ok(isUnscheduled(R, { id: 'x', dayTypes: [], days: [] }), 'a task with no days at all is flagged unscheduled')

// ── Deleting a day type must not strand the tasks that named it ─────────────
const noActive = removeDayType(R, 'active')
ok(!noActive.tasks.some(t => t.dayTypes.includes('active')),
   'deleting a day type strips it from every task that named it')
ok(noActive.tasks.length === R.tasks.length, 'deleting a day type deletes no tasks')
ok(isUnscheduled(noActive, noActive.tasks.find(t => t.id === 'sk_pm_retinol')),
   'a task left with no days is unscheduled, not silently on every day')
ok(tasksForDay(noActive, 0).length === 8, 'Sunday drops to the everyday tasks once Active is gone')

// ── Deleting a block re-homes its tasks rather than deleting them ───────────
const noPre = removeBlock(R, 'preworkout')
ok(noPre.tasks.length === R.tasks.length, 'deleting a block deletes no tasks')
ok(noPre.tasks.find(t => t.id === 'ablazor').block === noPre.blocks[0].id,
   'a deleted block re-homes its tasks into the first surviving block')
ok(removeBlock({ ...R, blocks: [R.blocks[0]] }, R.blocks[0].id).blocks.length === 1,
   'the last block cannot be deleted — tasks need somewhere to live')

// ── Deleting a tag strips it from tasks ────────────────────────────────────
ok(!removeTag(R, 'skin').tasks.some(t => t.tags.includes('skin')), 'deleting a tag strips it from tasks')

// ── Reorder stays inside the block ─────────────────────────────────────────
const moved = moveTask(R, 'whey', 1)
ok(moved.tasks.find(t => t.id === 'whey').block === 'postworkout',
   'moving a task down keeps it in its own block')
ok(tasksForDay(moved, 1).map(t => t.id).join() !== monIds.join(), 'moving a task actually reorders the day')
ok(moveTask(R, 'ablazor', 1).tasks.map(t => t.id).join() === R.tasks.map(t => t.id).join(),
   'the only task in a block cannot be moved past its block-mates')

// ── Add and remove round-trip ──────────────────────────────────────────────
const added = upsertTask(R, {
  id: 'test_new', name: 'Test', detail: '', block: 'morning',
  tags: ['habit'], dayTypes: ['rest'], days: [], target: '', warn: '', wait: '',
})
ok(tasksForDay(added, 2).length === 9, 'a task added to Rest shows up on Tuesday')
ok(tasksForDay(added, 1).length === 15, 'and does NOT show up on Monday')
ok(removeTask(added, 'test_new').tasks.length === R.tasks.length, 'removing it puts the count back')

// ── Notifications are derived, and reproduce the old hand-kept schedule ─────
const sched = notifScheduleFor(R)
const at = id => sched.find(s => s.id === id)
ok(sched.length === 5, `five reminders derived from five blocks (got ${sched.length})`)
ok(at('morning').hour === 6 && at('morning').min === 20, 'morning fires 06:20, 10 min before the block')
ok(at('afternoon').hour === 16 && at('afternoon').min === 50, 'afternoon fires 16:50')
ok(at('preworkout').hour === 18 && at('preworkout').min === 20, 'pre-workout fires 18:20')
ok(at('postworkout').hour === 20 && at('postworkout').min === 55, 'post-workout fires 20:55')
ok(at('evening').hour === 21 && at('evening').min === 50, 'evening fires 21:50')
ok(at('preworkout').days.join() === '1,3,5,6', 'pre-workout only fires on session days')
ok(at('morning').days.length === 7, 'morning fires every day')
ok(at('morning').body.includes('ISDIN'), 'the reminder reads out the block it announces')
ok(sched.every((s, i) => i === 0 || (s.hour * 60 + s.min) >= (sched[i - 1].hour * 60 + sched[i - 1].min)),
   'reminders come back in clock order')

// A block whose tasks all went away must not keep announcing an empty list.
const emptied = { ...R, tasks: R.tasks.filter(t => t.block !== 'preworkout') }
ok(!notifScheduleFor(emptied).some(s => s.id === 'preworkout'), 'a block with no tasks schedules nothing')
// A reminder can't be pushed into the previous day, where `days` would be wrong.
const early = { ...R, blocks: R.blocks.map(b => (b.id === 'morning' ? { ...b, start: '00:05', remind: 10 } : b)) }
ok(notifScheduleFor(early).find(s => s.id === 'morning').hour === 0, 'a pre-dawn reminder clamps to midnight, it does not wrap')

// ── Times render as a range, dropping the shared day period ────────────────
// Asserted through Intl rather than against a literal "AM": this runs in
// whatever locale the machine has, and the first version of formatTimeRange
// matched /AM|PM/ and so silently did nothing on a phone rendering "6:30 a.m."
ok(formatTimeRange('06:30', '07:00').includes('–'), 'a block time renders as a range')
ok(formatTimeRange('06:30', '') === formatTimeRange('06:30', 'nonsense'), 'a missing end time degrades to just the start')
const period = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' })
  .formatToParts(new Date(2026, 0, 1, 6, 30)).find(p => p.type === 'dayPeriod')?.value
if (period) {
  const same = formatTimeRange('06:30', '07:00')
  const cross = formatTimeRange('06:30', '19:00')
  ok(same.split(period).length - 1 === 1, `a shared day period prints once, not twice ("${same}")`)
  ok(cross.includes(period), `a range crossing noon keeps both day periods ("${cross}")`)
} else {
  ok(!/[ap]\.?\s?m/i.test(formatTimeRange('06:30', '07:00')), '24-hour locale: there is no day period to collapse')
}

// ── A routine can arrive from a backup file, so it must survive garbage ─────
ok(normaliseRoutine(null, R) === R, 'a missing routine falls back whole')
ok(normaliseRoutine({ blocks: [], dayTypes: [] }, R) === R, 'a routine with no blocks falls back rather than half-loading')
const dirty = normaliseRoutine({
  dayTypes: [{ id: 'a', name: 'A', days: [1, 1, 9, -2, 3], tone: 'chartreuse' }],
  tags: [{ id: 't', label: 'T', tone: 'ok' }],
  blocks: [{ id: 'b', label: 'B', start: '25:99', remind: 9999 }],
  tasks: [
    { id: 'k', name: 'Keep', block: 'nope', tags: ['t', 'ghost'], dayTypes: ['a', 'ghost'], days: [3] },
    { id: 'k', name: 'Duplicate id' },
    { name: 'No id' },
    { id: 'noname' },
  ],
}, R)
ok(dirty.dayTypes[0].days.join() === '1,3', 'out-of-range and duplicate weekdays are dropped')
ok(dirty.dayTypes[0].tone === 'neutral', 'an unknown tone falls back to neutral, never leaks into a class name')
ok(dirty.blocks[0].start === '', 'an impossible time is dropped')
ok(dirty.blocks[0].remind === 120, 'an absurd reminder offset is clamped')
ok(dirty.tasks.length === 1, 'tasks with a duplicate id, no id or no name are dropped')
ok(dirty.tasks[0].block === 'b', 'a task pointing at a missing block is re-homed')
ok(dirty.tasks[0].tags.join() === 't' && dirty.tasks[0].dayTypes.join() === 'a',
   'references to things that do not exist are stripped')

console.log('\n── dates, weeks, stats ──────────────────────────────────────────')

// ── Local date key must never be UTC ────────────────────────────────────────
const late = new Date(2026, 7, 10, 23, 30)   // 11:30pm local on Aug 10
ok(getLocalDateKey(late) === '2026-08-10', 'late-evening date key stays on the local day (UTC bug)')
ok(getLocalDateKey(new Date(2026, 0, 1)) === '2026-01-01', 'month/day zero-padded')

// ── Weeks start Monday ──────────────────────────────────────────────────────
const w = getWeekDates(0, new Date(2026, 7, 10))     // Mon 10 Aug 2026
ok(w[0].getDay() === 1 && w[6].getDay() === 0, 'week runs Mon..Sun')
ok(getLocalDateKey(w[0]) === '2026-08-10', 'Monday of that week is the 10th')
const sun = getWeekStartMonday(0, new Date(2026, 7, 16)) // Sun 16 Aug
ok(getLocalDateKey(sun) === '2026-08-10', 'Sunday belongs to the week that began Mon the 10th')

// ── Stats: no-data must not be scored as 0% ─────────────────────────────────
const week = [
  { pct: 100, isFuture: false }, { pct: 100, isFuture: false }, { pct: null, isFuture: false },
  { pct: 50, isFuture: false }, { pct: null, isFuture: true }, { pct: null, isFuture: true }, { pct: null, isFuture: true },
]
const s = weekStats(week)
ok(s.avg === 83, `avg ignores no-data and future days (got ${s.avg}, expected 83)`)
ok(s.best === 100, 'best day found')
ok(s.streak === 0, 'streak breaks at the 50% day')
const s2 = weekStats([{ pct: 100, isFuture: false }, { pct: 50, isFuture: false }, { pct: 100, isFuture: false }, { pct: 100, isFuture: false }])
ok(s2.streak === 2, `streak counts back from the last logged day (got ${s2.streak})`)
ok(weekStats([{ pct: null, isFuture: true }]).avg === null, 'an unlived week reports null, not 0%')

// ── The seed is a copy, not the module's own object ─────────────────────────
const a = defaultRoutine()
a.tasks[0].name = 'MUTATED'
ok(defaultRoutine().tasks[0].name !== 'MUTATED', 'defaultRoutine() hands out a fresh clone every time')

console.log(fail ? `\n${fail} FAILED` : '\nAll checks passed')
process.exit(fail ? 1 : 0)
