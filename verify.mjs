/* Domain assertions — `node verify.mjs`.
 *
 * Three jobs now. The seed still classifies the week correctly and still uses
 * the fifteen habit ids history is keyed by. The v2 engine holds up under
 * edits. And the v1→v2 MIGRATION carries a real v1 document across without
 * dropping a task or renaming an id — that one matters most, because getting it
 * wrong silently orphans eight months of logs. */

import { defaultRoutine, blankRoutine, backfillFromSeed } from './src/lib/protocol.js'
import {
  stepsForDay, habitStepsForDay, dayKindFor, templateForDay, daysForTemplate,
  habitDays, isUnusedHabit, stepsByCategory, totalWaitMinutes, formatWait,
  notifScheduleFor, normaliseRoutine, formatTime, getHabit, getTemplate,
  upsertHabit, removeHabit, removeCategory, removeTemplate,
  addHabitStep, addWaitStep, removeStep, moveStep, updateStep,
  assignDay, setTemplateDays, setHabitDays,
  habitCountIn, stepDoneIn, dayProgress, effectiveTime, resolveSteps,
  dedupeLibrary, findDuplicateHabits, setDayColor, dayColorFor, isRestDay,
  renameTemplate, duplicateTemplate, totalDayMinutes, rewriteCheckedIds,
  ALL_DAYS, PALETTE, REST_COLOR,
} from './src/lib/routine.js'
import { getLocalDateKey, getWeekDates, getWeekStartMonday } from './src/lib/dates.js'
import { weekStats } from './src/lib/weeks.js'

import { ICONS, iconFor } from './src/lib/icons.js'

let fail = 0
const ok = (c, m) => { if (!c) { console.log('FAIL:', m); fail++ } else console.log('ok  :', m) }

const R = defaultRoutine()
const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const n = d => habitStepsForDay(R, d).length

console.log('\n── the shipped week ─────────────────────────────────────────────')
for (const d of [1, 2, 3, 4, 5, 6, 0]) {
  const steps = stepsForDay(R, d)
  console.log(`  ${names[d]}: ${String(n(d)).padStart(2)} habits + ${steps.length - n(d)} waits`
    + `  ${String(totalWaitMinutes(steps)).padStart(2)} min waiting   ${dayKindFor(R, d).text}`)
}

// ── The week the seed encodes ───────────────────────────────────────────────
ok(dayKindFor(R, 1).label === 'Gym' && dayKindFor(R, 3).label === 'Gym' && dayKindFor(R, 5).label === 'Gym',
   'Mon/Wed/Fri run the Gym template')
ok(templateForDay(R, 1) === templateForDay(R, 3), 'and they share ONE template object, not three copies')
ok(daysForTemplate(R, 'tpl_gym').join() === '1,3,5,6', 'Gym covers Mon Wed Fri Sat')
ok(dayKindFor(R, 0).label === 'Active', 'Sunday is Active')
ok(dayKindFor(R, 2).label === 'Rest' && dayKindFor(R, 4).label === 'Rest', 'Tue/Thu are Rest')
ok(n(1) === 15 && n(6) === 15, `gym + mobility days are 15 habits (got ${n(1)}/${n(6)})`)
ok(n(0) === 12, `Sunday is 12 habits (got ${n(0)})`)
ok(n(2) === 8 && n(4) === 8, `Tue/Thu are 8 habits (got ${n(2)}/${n(4)})`)

// Sunday is active with no workout — the constraint v1 needed two flags for.
const sunIds = habitStepsForDay(R, 0).map(s => s.habitId)
ok(sunIds.includes('sk_pm_retinol') && !sunIds.includes('ablazor') && !sunIds.includes('whey'),
   'Sunday has the actives and NONE of the workout supplements')

// ── Habit ids are the storage contract ──────────────────────────────────────
const EXPECTED = ['sk_am_cleanse', 'sk_am_growth', 'sk_am_vitc', 'sk_am_ha', 'sk_am_lub', 'sk_am_spf',
  'tadalafil', 'ablazor', 'whey', 'creatine', 'sk_pm_cleanse', 'sk_pm_ha', 'sk_pm_retinol', 'sk_pm_min', 'sk_pm_lub']
ok(R.habits.map(h => h.id).sort().join() === [...EXPECTED].sort().join(),
   'habit ids match the legacy task-id set exactly (no orphaned history)')
let dupes = 0
for (const d of ALL_DAYS) {
  const ids = habitStepsForDay(R, d).map(s => s.habitId)
  if (new Set(ids).size !== ids.length) dupes++
}
ok(dupes === 0, 'no habit appears twice in one day')
const stepIds = R.templates.flatMap(t => t.steps.map(s => s.id))
ok(new Set(stepIds).size === stepIds.length, 'every step id in the seed is unique')

// ── Waits are steps, and they are not achievements ──────────────────────────
const monSteps = stepsForDay(R, 1)
ok(monSteps.some(s => s.kind === 'wait'), 'a day contains wait steps')
ok(monSteps.length > n(1), 'the sequence is longer than the score denominator')
const retinolAt = monSteps.findIndex(s => s.habitId === 'sk_pm_retinol')
ok(monSteps[retinolAt - 1]?.kind === 'wait' && monSteps[retinolAt - 1].minutes === 13,
   'the bone-dry wait sits immediately BEFORE retinol, as its own step')
ok(totalWaitMinutes(monSteps) === 28, `Monday asks for 28 min of waiting (got ${totalWaitMinutes(monSteps)})`)
ok(formatWait(45) === '45 min' && formatWait(60) === '1 h' && formatWait(90) === '1 h 30', 'waits read at a glance')

// ── Resolved steps carry their habit and category ───────────────────────────
const first = monSteps[0]
ok(first.habit?.name === 'LUMACA Cleanser', 'a habit step resolves its habit')
ok(first.category?.label === 'Skincare', 'and its category')
ok(/^#[0-9A-F]{6}$/i.test(first.category.color), 'a category carries a literal colour for the card fill')

console.log('\n── engine ───────────────────────────────────────────────────────')

// ── habitDays is derived from the week, never stored ────────────────────────
ok(habitDays(R, 'sk_am_spf').join() === '0,1,2,3,4,5,6', 'sunscreen runs every day')
ok(habitDays(R, 'ablazor').join() === '1,3,5,6', 'ablazor runs Mon Wed Fri Sat')
ok(!('days' in R.habits[0]), 'a habit does not store its own days — they are derived')

// ── Templates are shared: editing one edits every day that runs it ──────────
let edited = addWaitStep(R, 'tpl_gym', 5, 'test')
ok(stepsForDay(edited, 1).length === stepsForDay(edited, 3).length,
   'adding a step to Gym changes Mon AND Wed — that is what sharing means')
ok(stepsForDay(edited, 2).length === stepsForDay(R, 2).length, 'and leaves Rest alone')

// ── A habit is inserted at the position its TIME implies ────────────────────
let withNew = upsertHabit(blankRoutine(), { id: 'h_noon', name: 'Noon thing', time: '12:00', categoryId: 'cat_skincare', detail: '', remind: null, warn: '' })
withNew = upsertHabit(withNew, { id: 'h_am', name: 'Early', time: '07:00', categoryId: 'cat_skincare', detail: '', remind: null, warn: '' })
withNew = upsertHabit(withNew, { id: 'h_pm', name: 'Late', time: '20:00', categoryId: 'cat_skincare', detail: '', remind: null, warn: '' })
withNew = { ...withNew, templates: [{ id: 't1', title: 'Day', color: PALETTE[0], steps: [] }], week: ALL_DAYS.map(() => 't1') }
withNew = addHabitStep(withNew, 't1', 'h_pm')
withNew = addHabitStep(withNew, 't1', 'h_am')
withNew = addHabitStep(withNew, 't1', 'h_noon')
ok(withNew.templates[0].steps.map(s => s.habitId).join() === 'h_am,h_noon,h_pm',
   'habits land in clock order regardless of the order they were added')
/* THE RULE THAT INVERTED IN v3, and the reason the library dedupe is safe.
   v2 refused a duplicate, which is what made "a glass of water, four times a
   day" inexpressible and forced the shipped library to carry the same item
   twice under two ids. Adding a habit that is already in a template now adds a
   SECOND STEP, with its own id, which is what a tick can then address. */
const twice = addHabitStep(withNew, 't1', 'h_am')
ok(twice.templates[0].steps.length === 4, 'a habit can be added to one day more than once')
ok(twice.templates[0].steps.filter(s => s.habitId === 'h_am').length === 2, 'and it is there twice')
ok(new Set(twice.templates[0].steps.map(s => s.id)).size === 4,
   'the two occurrences get DIFFERENT step ids — completion is keyed by them')
ok(habitCountIn(twice.templates[0], 'h_am') === 2, 'habitCountIn reports the repeat')

// ── Reorder, update, remove ─────────────────────────────────────────────────
const s0 = withNew.templates[0].steps[0].id
ok(moveStep(withNew, 't1', s0, 1).templates[0].steps[0].habitId === 'h_noon', 'a step moves down')
ok(moveStep(withNew, 't1', s0, -1).templates[0].steps.map(s => s.habitId).join() === 'h_am,h_noon,h_pm',
   'a step at the top cannot move up')
const wAdded = addWaitStep(withNew, 't1', 15, 'rest', 1)
ok(wAdded.templates[0].steps[1].kind === 'wait', 'a wait inserts at the requested index')
ok(updateStep(wAdded, 't1', wAdded.templates[0].steps[1].id, { minutes: 30 }).templates[0].steps[1].minutes === 30,
   'a wait can be re-timed')
ok(removeStep(wAdded, 't1', wAdded.templates[0].steps[1].id).templates[0].steps.length === 3, 'a wait can be removed')

// ── Deleting things must not strand what pointed at them ────────────────────
const noAblazor = removeHabit(R, 'ablazor')
ok(!noAblazor.habits.some(h => h.id === 'ablazor'), 'the habit is gone from the library')
ok(!noAblazor.templates.some(t => t.steps.some(s => s.habitId === 'ablazor')),
   'and out of every template that used it')
ok(habitStepsForDay(noAblazor, 1).length === 14, 'Monday drops to 14')

const noSkincare = removeCategory(R, 'cat_skincare')
ok(noSkincare.habits.every(h => h.categoryId !== 'cat_skincare'), 'deleting a category re-homes its habits')
ok(noSkincare.habits.length === R.habits.length, 'and deletes none of them')
ok(removeCategory({ ...R, categories: [R.categories[0]] }, R.categories[0].id).categories.length === 1,
   'the last category cannot be deleted')

const noGym = removeTemplate(R, 'tpl_gym')
ok(noGym.week[1] === null && noGym.week[3] === null, 'deleting a template frees the weekdays that ran it')
ok(stepsForDay(noGym, 1).length === 0 && dayKindFor(noGym, 1).text === 'OPEN', 'and that day reads as unplanned')
ok(noGym.habits.length === R.habits.length, 'deleting a template deletes no habits')
ok(isUnusedHabit(noGym, 'ablazor') === true,
   'ablazor lived only in Gym, so deleting that template leaves it unused — the editor must flag it')
ok(isUnusedHabit(noGym, 'sk_am_spf') === false, 'sunscreen survives: Active and Rest still use it')

// ── Assigning days ──────────────────────────────────────────────────────────
ok(assignDay(R, 2, 'tpl_gym').week[2] === 'tpl_gym', 'a weekday can be pointed at another template')
const restEverywhere = setTemplateDays(R, 'tpl_rest', [0, 1, 2, 3, 4, 5, 6])
ok(restEverywhere.week.every(id => id === 'tpl_rest'), 'a template can take the whole week')
ok(setTemplateDays(R, 'tpl_rest', []).week.filter(id => id === 'tpl_rest').length === 0,
   'and can be cleared off it')

// ── setHabitDays bridges "which days?" to the template model ────────────────
let hd = setHabitDays(R, 'ablazor', [2, 4])          // Rest days only
ok(habitDays(hd, 'ablazor').join() === '2,4', 'a habit can be moved onto Rest days')
ok(!stepsForDay(hd, 1).some(s => s.habitId === 'ablazor'), 'and comes off the Gym days')
// The consequence the UI has to warn about, asserted so it cannot regress silently:
hd = setHabitDays(R, 'ablazor', [1])                  // Monday only…
ok(habitDays(hd, 'ablazor').join() === '1,3,5,6',
   'asking for Monday alone still gives Wed/Fri/Sat — they share the Gym template')

// ── MOST HABITS HAVE NO TIME — a stack, not a timetable ─────────────────────
const timed = R.habits.filter(h => h.time)
ok(timed.length === 5, `only the clock-bound habits carry a time (got ${timed.length} of ${R.habits.length})`)
ok(timed.every(h => h.remind != null), 'and every timed habit is one that actually wants a reminder')
ok(R.habits.filter(h => !h.time).every(h => h.remind === null),
   'an untimed habit can never hold a stale reminder')
ok(R.habits.find(h => h.id === 'sk_am_growth').time === '', 'a mid-routine skincare step is untimed')
ok(R.habits.find(h => h.id === 'sk_am_cleanse').time === '06:30', 'the step that OPENS the morning keeps its time')

// An untimed habit appends rather than trying to place itself by clock.
let stack = upsertHabit(blankRoutine(), { id: 'h_free', name: 'Free', time: '', categoryId: 'cat_skincare', detail: '', remind: null, warn: '' })
stack = upsertHabit(stack, { id: 'h_late', name: 'Sleep', time: '23:00', categoryId: 'cat_skincare', detail: '', remind: 10, warn: '' })
stack = { ...stack, templates: [{ id: 't2', title: 'Day', color: PALETTE[0], steps: [] }], week: ALL_DAYS.map(() => 't2') }
stack = addHabitStep(stack, 't2', 'h_free')
stack = addHabitStep(stack, 't2', 'h_late')
ok(stack.templates[0].steps.map(s => s.habitId).join() === 'h_free,h_late',
   'an untimed habit sits where it was put; a timed one still sorts by clock')
ok(notifScheduleFor(stack).length === 1, 'only the timed habit schedules a reminder')

// ── Notifications derive from habits, and merge by fire time ────────────────
const sched = notifScheduleFor(R)
const at = (h, m) => sched.find(s => s.hour === h && s.min === m)
ok(sched.length > 0, `reminders derived from habit times (got ${sched.length})`)
ok(!!at(6, 20), 'the 06:30 cleanse fires at 06:20')
ok(at(6, 20).days.length === 7, 'and every day, because every template runs it')
ok(!!at(16, 50), 'tadalafil fires at 16:50')
ok(at(18, 20)?.days.join() === '1,3,5,6', 'ablazor only fires on the days Gym runs')
ok(sched.every((s, i) => i === 0 || (s.hour * 60 + s.min) >= (sched[i - 1].hour * 60 + sched[i - 1].min)),
   'reminders come back in clock order')
const noRemind = { ...R, habits: R.habits.map(h => ({ ...h, remind: null })) }
ok(notifScheduleFor(noRemind).length === 0, 'a habit with no reminder schedules nothing')
const early = { ...R, habits: R.habits.map(h => (h.id === 'sk_am_cleanse' ? { ...h, time: '00:05', remind: 10 } : h)) }
ok(notifScheduleFor(early).some(s => s.hour === 0 && s.min === 0), 'a pre-dawn reminder clamps to midnight, it does not wrap')

// Two habits at the same fire time become ONE notification.
const merged = notifScheduleFor({
  ...R,
  habits: R.habits.map(h => (['whey', 'creatine'].includes(h.id) ? { ...h, time: '21:00', remind: 5 } : h)),
})
const post = merged.find(s => s.hour === 20 && s.min === 55)
ok(post && /Whey/.test(post.body) && /Creatine/.test(post.body), 'habits sharing a fire time merge into one reminder')

console.log('\n── v1 → v2 migration (the history contract) ─────────────────────')

const V1 = {
  version: 1,
  dayTypes: [
    { id: 'gym', name: 'Gym', tone: 'brand', days: [1, 3, 5] },
    { id: 'mobility', name: 'Mobility', tone: 'info', days: [6] },
    { id: 'active', name: 'Active', tone: 'warn', days: [0, 1, 3, 5, 6] },
    { id: 'rest', name: 'Rest', tone: 'neutral', days: [2, 4] },
    { id: 'everyday', name: 'Every day', tone: 'neutral', days: [0, 1, 2, 3, 4, 5, 6] },
  ],
  tags: [
    { id: 'skin', label: 'Skincare', tone: 'info' },
    { id: 'supp', label: 'Supplements', tone: 'brand' },
  ],
  blocks: [
    { id: 'morning', label: 'Morning Skincare', start: '06:30', end: '07:00', remind: 10 },
    { id: 'preworkout', label: 'Pre-Workout', start: '18:30', end: '19:00', remind: 10 },
    { id: 'evening', label: 'Evening Skincare', start: '22:00', end: '22:30', remind: 10 },
  ],
  tasks: [
    { id: 'sk_am_cleanse', name: 'Cleanser', block: 'morning', tags: ['skin'], dayTypes: ['everyday'], days: [], detail: 'd', wait: '', warn: '', target: '' },
    { id: 'sk_am_vitc', name: 'Vitamin C', block: 'morning', tags: ['skin'], dayTypes: ['active'], days: [], detail: 'd', wait: 'Wait 2–3 min before next step', warn: '', target: '' },
    { id: 'ablazor', name: 'Ablazor', block: 'preworkout', tags: ['supp'], dayTypes: ['gym', 'mobility'], days: [], detail: 'd', wait: '', warn: '', target: '' },
    { id: 'sk_pm_retinol', name: 'Retinol', block: 'evening', tags: ['skin'], dayTypes: ['active'], days: [], detail: 'd', wait: '', warn: 'Never layer with Vitamin C', target: '' },
  ],
}

const M = normaliseRoutine(V1, null)
ok(M !== null && M.version === 3, 'a v1 document migrates straight to v3')
ok(M.habits.map(h => h.id).sort().join() === ['sk_am_cleanse', 'sk_am_vitc', 'ablazor', 'sk_pm_retinol'].sort().join(),
   'EVERY v1 task id survives the migration unchanged — history still lines up')
ok(M.habits.length === V1.tasks.length, 'no task is dropped')
ok(M.categories.map(c => c.id).join() === 'skin,supp', 'v1 tags become categories, ids intact')
ok(M.categories.every(c => /^#[0-9A-F]{6}$/i.test(c.color)), 'each migrated category gets a colour')
// v1 gave a time to the BLOCK, not to each task in it. Handing that time to
// every task invented per-habit times that never existed, which is exactly what
// the app no longer wants. Only the task that OPENS a block keeps it.
ok(M.habits.find(h => h.id === 'sk_am_cleanse').time === '06:30',
   'the first task of a block inherits that block start as its time')
ok(M.habits.find(h => h.id === 'sk_am_vitc').time === '',
   'the SECOND task of the same block is left untimed — v1 never said it happened at 06:30')
ok(M.habits.find(h => h.id === 'sk_am_vitc').remind === null, 'and carries no reminder')
ok(M.habits.find(h => h.id === 'ablazor').time === '18:30', 'each block opener gets its own block start')
ok(M.habits.filter(h => h.time).length === 3, 'one timed habit per block, no more')
ok(M.habits.find(h => h.id === 'sk_pm_retinol').warn === 'Never layer with Vitamin C', 'warnings survive')

// v1 scheduling is replayed, then identical days folded into one template.
const mDay = d => stepsForDay(M, d).filter(s => s.kind === 'habit').map(s => s.habitId)
ok(mDay(1).join() === 'sk_am_cleanse,sk_am_vitc,ablazor,sk_pm_retinol', 'Monday keeps exactly the tasks it had')
ok(mDay(2).join() === 'sk_am_cleanse', 'Tuesday keeps exactly the tasks it had')
ok(mDay(0).join() === 'sk_am_cleanse,sk_am_vitc,sk_pm_retinol', 'Sunday: actives, no workout — preserved')
ok(M.week[1] === M.week[3] && M.week[3] === M.week[5], 'Mon/Wed/Fri fold into ONE template')
ok(M.week[2] === M.week[4], 'Tue/Thu fold into one template')
ok(M.week[1] !== M.week[2], 'and gym days are not the same template as rest days')
// Mon/Wed/Fri AND Sat all resolve to the same four tasks here (ablazor is on
// both gym and mobility), so they fold into one template — which is the folding
// working, not failing. Three distinct days: {Mon Wed Fri Sat}, {Tue Thu}, {Sun}.
ok(M.templates.length === 3, `three distinct days in that week (got ${M.templates.length})`)
ok(M.week[6] === M.week[1], 'Saturday folds in with the gym days — its task list is identical')
ok(M.templates.some(t => t.title === 'Gym') && M.templates.some(t => t.title === 'Rest'),
   'templates are named after the v1 day type that described them')

// v1's free-text wait becomes a real step, after the habit it followed.
const vitcAt = stepsForDay(M, 1).findIndex(s => s.habitId === 'sk_am_vitc')
const after = stepsForDay(M, 1)[vitcAt + 1]
ok(after?.kind === 'wait' && after.minutes === 2,
   `"Wait 2–3 min" became a 2-minute wait step after Vitamin C (got ${after?.minutes})`)

// ── Garbage in, sound document out ──────────────────────────────────────────
ok(normaliseRoutine(null, R) === R, 'a missing routine falls back whole')
ok(normaliseRoutine({ version: 2, categories: [] }, R) === R, 'a routine with no categories falls back')
const dirty = normaliseRoutine({
  version: 2,
  categories: [{ id: 'c', label: 'C', color: 'not-a-colour' }],
  habits: [
    { id: 'h', name: 'Keep', categoryId: 'ghost', time: '99:99', remind: 9999 },
    { id: 'h', name: 'Duplicate id' },
    { name: 'No id' },
    { id: 'noname' },
  ],
  templates: [{ id: 't', title: 'T', steps: [
    { id: 's1', kind: 'habit', habitId: 'h' },
    { id: 's2', kind: 'habit', habitId: 'ghost' },
    { id: 's3', kind: 'wait', minutes: -5 },
    { id: 's1', kind: 'wait', minutes: 5 },
    { id: 's4', kind: 'nonsense' },
  ] }],
  week: ['t', 'ghost', null, null, null, null, null],
}, R)
ok(dirty.categories[0].color === PALETTE[0], 'an invalid colour falls back to the palette')
ok(dirty.habits.length === 1, 'habits with a duplicate id, no id or no name are dropped')
ok(dirty.habits[0].categoryId === 'c', 'a habit pointing at a missing category is re-homed')
ok(dirty.habits[0].time === '', 'an impossible time is dropped')
ok(dirty.habits[0].remind === 120, 'an absurd reminder offset is clamped')
ok(dirty.templates[0].steps.length === 2, 'steps that dangle, repeat an id, or have no known kind are dropped')
ok(dirty.templates[0].steps[1].minutes === 0, 'a negative wait clamps to zero')
ok(dirty.week[1] === null, 'a weekday pointing at a missing template is freed')

// ── The blank routine the first-run flow starts from ────────────────────────
const B = blankRoutine()
ok(B.habits.length === 0 && B.templates.length === 0, 'blankRoutine has nothing in it')
ok(B.categories.length === 4, 'but keeps the four starting categories')
ok(B.week.every(x => x === null), 'and an unassigned week')
ok(stepsForDay(B, 1).length === 0 && dayKindFor(B, 1).text === 'OPEN', 'an unplanned day is not an error')

console.log('\n── dates, weeks, stats ──────────────────────────────────────────')

const late = new Date(2026, 7, 10, 23, 30)
ok(getLocalDateKey(late) === '2026-08-10', 'late-evening date key stays on the local day (UTC bug)')
ok(getLocalDateKey(new Date(2026, 0, 1)) === '2026-01-01', 'month/day zero-padded')
const w = getWeekDates(0, new Date(2026, 7, 10))
ok(w[0].getDay() === 1 && w[6].getDay() === 0, 'week runs Mon..Sun')
ok(getLocalDateKey(getWeekStartMonday(0, new Date(2026, 7, 16))) === '2026-08-10',
   'Sunday belongs to the week that began Mon the 10th')

const week = [
  { pct: 100, isFuture: false }, { pct: 100, isFuture: false }, { pct: null, isFuture: false },
  { pct: 50, isFuture: false }, { pct: null, isFuture: true }, { pct: null, isFuture: true }, { pct: null, isFuture: true },
]
const s = weekStats(week)
ok(s.avg === 83, `avg ignores no-data and future days (got ${s.avg})`)
ok(s.streak === 0, 'streak breaks at the 50% day')
ok(weekStats([{ pct: null, isFuture: true }]).avg === null, 'an unlived week reports null, not 0%')

// ── Time formatting, asserted through Intl not a literal "AM" ───────────────
const period = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' })
  .formatToParts(new Date(2026, 0, 1, 6, 30)).find(p => p.type === 'dayPeriod')?.value
ok(formatTime('06:30').length > 0, 'a habit time renders through the locale')
if (period) ok(formatTime('06:30').includes(period), 'and carries the locale day period')
else ok(!/[ap]\.?\s?m/i.test(formatTime('06:30')), '24-hour locale: no day period')

// ── The seed is a copy, not the module's own object ────────────────────────
const a = defaultRoutine()
a.habits[0].name = 'MUTATED'
ok(defaultRoutine().habits[0].name !== 'MUTATED', 'defaultRoutine() hands out a fresh clone every time')

console.log('\n── v3: repeats, step-keyed completion, the dedupe ───────────────')

/* ── stepDoneIn: the back-compatible read ─────────────────────────────────────
   This is the assertion that stands between the schema change and eight months
   of logged history. A day written before v3 is keyed by HABIT id; a day
   written now is keyed by STEP id; both have to read correctly, and a repeat
   added after the fact must not arrive pre-ticked. */
let rep = blankRoutine()
rep = upsertHabit(rep, { id: 'water', name: 'Water', time: '', categoryId: 'cat_skincare', detail: '', remind: null, warn: '', icon: 'GlassWater', duration: 1 })
rep = { ...rep, templates: [{ id: 'tw', title: 'Day', color: PALETTE[0], rest: false, steps: [] }], week: ALL_DAYS.map(() => 'tw') }
rep = addHabitStep(rep, 'tw', 'water')
rep = addHabitStep(rep, 'tw', 'water')
rep = addHabitStep(rep, 'tw', 'water')
rep = addHabitStep(rep, 'tw', 'water')

const waterSteps = stepsForDay(rep, 1)
ok(waterSteps.length === 4, 'four glasses of water are four steps')
ok(new Set(waterSteps.map(s => s.id)).size === 4, 'each with its own id')

// A tick on the third glass is a tick on the THIRD glass and nothing else.
const oneChecked = { [waterSteps[2].id]: true }
ok(waterSteps.filter(s => stepDoneIn(oneChecked, s, waterSteps)).length === 1,
   'ticking one occurrence ticks exactly one — the bug step-keying exists to fix')
ok(stepDoneIn(oneChecked, waterSteps[2], waterSteps), 'and it is the right one')

// A pre-v3 log keyed by habit id resolves against the FIRST occurrence only.
const legacyChecked = { water: true }
ok(stepDoneIn(legacyChecked, waterSteps[0], waterSteps),
   'a legacy habit-id tick still reads as done — no history is lost')
ok(!stepDoneIn(legacyChecked, waterSteps[1], waterSteps),
   'and it counts for the FIRST occurrence only, so repeats added later are not pre-ticked')
ok(waterSteps.filter(s => stepDoneIn(legacyChecked, s, waterSteps)).length === 1,
   'so a legacy day scores 1/4, not 4/4')

/* ── Step-level time overrides ───────────────────────────────────────────── */
const v3Timed = updateStep(rep, 'tw', waterSteps[3].id, { time: '21:00' })
const timedSteps = stepsForDay(v3Timed, 1)
ok(timedSteps[3].time === '21:00', 'a step can pin its own time')
ok(timedSteps[0].time === '', 'and it does not leak onto the other occurrences')
ok(getHabit(v3Timed, 'water').time === '', 'nor onto the habit itself')
ok(effectiveTime({ time: null }, { time: '08:00' }) === '08:00', 'null inherits the habit time')
ok(effectiveTime({ time: '' }, { time: '08:00' }) === '', 'an empty string is a deliberate no-time on this step')

/* ── The library dedupe ───────────────────────────────────────────────────────
   The v3Seed carries three AM/PM pairs that are the same item under two ids. The
   merge must lose NOTHING: not a step, not a reminder, and not a logged tick. */
const v3Seed = defaultRoutine()
ok(findDuplicateHabits(v3Seed).length === 3, 'the seed has three duplicate pairs (cleanser, HA, Lubriderm)')

const beforeCounts = ALL_DAYS.map(d => habitStepsForDay(v3Seed, d).length)
const { routine: deduped, merges, rewrites } = dedupeLibrary(v3Seed)
const afterCounts = ALL_DAYS.map(d => habitStepsForDay(deduped, d).length)

ok(deduped.habits.length === 12, `the library goes 15 → 12 (got ${deduped.habits.length})`)
ok(merges.length === 3, 'three merges are reported')
ok(beforeCounts.join() === afterCounts.join(),
   `NO DAY LOSES A STEP (${beforeCounts.join()} → ${afterCounts.join()})`)
ok(findDuplicateHabits(deduped).length === 0, 'and no duplicates remain')

// The 06:30 / 22:00 split is what a naive merge would have destroyed.
const gymAfter = getTemplate(deduped, 'tpl_gym')
const cleanses = gymAfter.steps.filter(s => s.habitId === 'sk_am_cleanse')
ok(cleanses.length === 2, 'the Gym day still has both cleanses, now as one habit twice')
ok(cleanses[1].time === '22:00', 'the evening one PINS 22:00 onto the step')
ok(cleanses[0].time === null, 'the morning one still inherits 06:30 from the habit')

const schedAfter = notifScheduleFor(deduped).map(x => `${String(x.hour).padStart(2, '0')}:${String(x.min).padStart(2, '0')}`)
ok(schedAfter.includes('06:20') && schedAfter.includes('21:50'),
   'BOTH reminders survive the merge — the whole reason time moved onto the step')

// Nothing in a template may point v3At a habit that no longer exists.
const survivors = new Set(deduped.habits.map(h => h.id))
const orphans = deduped.templates.flatMap(t => t.steps.filter(s => s.kind === 'habit' && !survivors.has(s.habitId)))
ok(orphans.length === 0, 'no step is left pointing at a removed habit')

/* ── History survives the dedupe ─────────────────────────────────────────── */
// A Monday (Gym) logged under the OLD ids, including the removed sk_pm_cleanse.
const v3Logs = [{ id: '2026-08-10', checked: { sk_am_cleanse: true, sk_pm_cleanse: true }, total: 15, updatedAt: 'x', createdAt: 'x' }]
const v3Moved = rewriteCheckedIds(v3Logs, deduped, merges, rewrites, () => 'y')
const movedKeys = Object.keys(v3Moved[0].checked)
ok(movedKeys.length === 2, 'both ticks survive the rewrite')
ok(!movedKeys.includes('sk_pm_cleanse'), 'the removed id is gone from the log')
ok(movedKeys.includes(cleanses[1].id), 'and its tick landed on the EVENING step, not the morning one')

// Read it back through the app's own resolver: 2 of the day's steps are done.
const monAfter = stepsForDay(deduped, 1).filter(s => s.kind === 'habit')
ok(monAfter.filter(s => stepDoneIn(v3Moved[0].checked, s, monAfter)).length === 2,
   'and the day still scores 2 — the tick is where the user put it')

// A day whose template no longer exists falls back rather than dropping.
const orphanLog = [{ id: '2026-08-10', checked: { sk_pm_ha: true }, total: 9, updatedAt: 'x', createdAt: 'x' }]
const noWeek = { ...deduped, week: ALL_DAYS.map(() => null) }
const fallback = rewriteCheckedIds(orphanLog, noWeek, merges, rewrites, () => 'y')
ok(Object.keys(fallback[0].checked).length === 1, 'a tick with no resolvable step is kept, not dropped')
ok(Object.keys(fallback[0].checked)[0] === 'sk_am_ha', 'it falls back to the surviving habit id')

// Merging is scoped by CATEGORY as well as name.
const sameName = upsertHabit(
  upsertHabit(blankRoutine(), { id: 'w1', name: 'Walk', categoryId: 'cat_workout', time: '', detail: '', remind: null, warn: '', icon: '', duration: 0 }),
  { id: 'w2', name: 'Walk', categoryId: 'cat_leisure', time: '', detail: '', remind: null, warn: '', icon: '', duration: 0 })
ok(findDuplicateHabits(sameName).length === 0,
   'two habits with the same name in DIFFERENT categories are not duplicates')

/* ── dayProgress: the wake → sleep window ─────────────────────────────────── */
const v3At = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d }
ok(dayProgress('', '23:00', v3At(12, 0)) === null, 'no wake time means no bar at all, not 0%')
ok(dayProgress('07:00', '23:00', v3At(7, 0)) === 0, 'at the wake time it is 0%')
ok(dayProgress('07:00', '23:00', v3At(15, 0)) === 50, 'halfway through a 16h day is 50%')
ok(dayProgress('07:00', '23:00', v3At(23, 30)) === 100, 'past bedtime it caps at 100%')
/* THE WRAP, AND THE BUG IT REPLACED. 05:00 is the tail of last night when the
   window crosses midnight, and simply "before I got v3Up" when it does not. The
   v3First version wrapped unconditionally and reported a 07:00–23:00 day as 100%
   complete v3At 5am — "your day is over" two hours before it starts. */
ok(dayProgress('07:00', '00:30', v3At(0, 15)) > 95, 'a bedtime past midnight still reads as nearly done')
ok(dayProgress('07:00', '00:30', v3At(23, 0)) < 95, 'and 23:00 is before it, not after')
ok(dayProgress('07:00', '23:00', v3At(5, 0)) === 0,
   'a NON-wrapping window reads 0% before wake-up, not 100%')

/* ── Rest days and per-day colour ─────────────────────────────────────────── */
ok(isRestDay(R, 2) && isRestDay(R, 4), 'Tue/Thu are marked rest days')
ok(!isRestDay(R, 1), 'Monday is not')
ok(dayColorFor(R, 2) === REST_COLOR, 'a rest day always shows the rest colour')
ok(!PALETTE.includes(REST_COLOR), 'and that colour is NOT in the identity palette — it is unreadable as a wash')

const tinted = setDayColor(R, 1, PALETTE[1])
ok(dayColorFor(tinted, 1) === PALETTE[1], 'a weekday can override its template colour')
ok(dayColorFor(tinted, 3) === getTemplate(R, 'tpl_gym').color,
   'and Wednesday keeps the routine colour even though it shares the template')
ok(dayColorFor(setDayColor(tinted, 1, null), 1) === getTemplate(R, 'tpl_gym').color,
   'clearing it falls back to the routine rather than freezing the same hex')
ok(dayColorFor(setDayColor(R, 2, PALETTE[0]), 2) === REST_COLOR,
   'rest wins over a per-day colour — it is a different axis, not an override')

/* ── Template CRUD ────────────────────────────────────────────────────────── */
ok(renameTemplate(R, 'tpl_gym', 'Lifting').templates.find(t => t.id === 'tpl_gym').title === 'Lifting', 'a template renames')
ok(renameTemplate(R, 'tpl_gym', '   ') === R, 'and an empty name is refused rather than saved')

const copied = duplicateTemplate(R, 'tpl_gym', 'Gym B')
const v3Copy = copied.templates.find(t => t.title === 'Gym B')
ok(copied.templates.length === R.templates.length + 1, 'a template duplicates')
ok(v3Copy.steps.length === getTemplate(R, 'tpl_gym').steps.length, 'with all its steps')
ok(daysForTemplate(copied, v3Copy.id).length === 0, 'and lands on no weekday')
/* Step ids are minted fresh. Sharing them would validate — they only have to be
   unique per template — but completion is keyed by step id, so a v3Copy that
   shared them would inherit the original's ticks on every day it ran. */
const origIds = new Set(getTemplate(R, 'tpl_gym').steps.map(s => s.id))
ok(v3Copy.steps.every(s => !origIds.has(s.id)),
   'the copy gets FRESH step ids, or it would inherit the original ticks')

const v3Gone = removeTemplate(setDayColor(R, 1, PALETTE[1]), 'tpl_gym')
ok(!v3Gone.templates.some(t => t.id === 'tpl_gym'), 'a template deletes')
ok(v3Gone.week[1] === null, 'and frees the weekdays that ran it')
ok(v3Gone.weekColor[1] === null, 'and clears the colour those days had picked')

/* ── Glyphs and durations ─────────────────────────────────────────────────── */
ok(R.habits.every(h => typeof h.icon === 'string'), 'every seeded habit carries an icon field')
ok(R.habits.every(h => !h.icon || ICONS[h.icon]), 'and every icon name it uses actually exists in the set')
ok(iconFor({ icon: 'nope' }, null) != null, 'an unknown glyph name falls back rather than returning null')
ok(R.habits.some(h => h.duration > 0), 'durations are seeded')
ok(totalDayMinutes(stepsForDay(R, 1)) > totalWaitMinutes(stepsForDay(R, 1)),
   'a day total counts habit durations as well as waits')

/* ── v2 documents upgrade cleanly ─────────────────────────────────────────── */
const v2doc = {
  version: 2,
  categories: [{ id: 'c', label: 'C', color: PALETTE[0] }],
  habits: [{ id: 'h', name: 'H', detail: '', time: '08:00', categoryId: 'c', remind: 10, warn: '' }],
  templates: [{ id: 't', title: 'T', color: PALETTE[0], steps: [{ id: 's', kind: 'habit', habitId: 'h' }] }],
  week: ['t', 't', 't', 't', 't', 't', 't'],
}
const v3Up = normaliseRoutine(v2doc, null)
ok(v3Up.version === 3, 'a v2 document normalises to v3')
ok(v3Up.habits[0].icon === '' && v3Up.habits[0].duration === 0, 'gaining an empty glyph and a zero duration')
ok(v3Up.templates[0].rest === false, 'and a rest flag that defaults off')
ok(v3Up.templates[0].steps[0].time === null, 'its steps inherit their habit time rather than being blanked')
ok(v3Up.weekColor.length === 7 && v3Up.weekColor.every(c => c === null), 'and a week with no colour overrides')
ok(normaliseRoutine({ ...v2doc, weekColor: ['nonsense', null, null, null, null, null, null] }, null).weekColor[0] === null,
   'a malformed colour override is dropped')


/* ── The v2 → v3 backfill ─────────────────────────────────────────────────────
   A device upgrading from v2 has no glyphs, no durations and no rest flags —
   its habits are the seed's under the seed's frozen ids, minus the two fields
   v3 added. Without this, the whole glyph system reaches new installs only, and
   Tue/Thu get shaded on the workload ramp instead of as rest days. */
const asV2 = {
  ...R,
  habits: R.habits.map(({ icon, duration, ...h }) => ({ ...h, icon: '', duration: 0 })),
  templates: R.templates.map(t => ({ ...t, rest: false })),
}
const filled = backfillFromSeed(asV2)
ok(filled.habits.find(h => h.id === 'sk_am_cleanse').icon === 'ShowerHead',
   'a v2 habit gets the glyph the seed knows for its id')
ok(filled.habits.find(h => h.id === 'sk_am_cleanse').duration === 2, 'and the duration')
ok(filled.templates.find(t => t.id === 'tpl_rest').rest === true,
   'and the Rest template is flagged rest again')

/* IT ONLY FILLS EMPTIES — a user's own choice is never overwritten. */
const chosen = { ...asV2, habits: asV2.habits.map(h =>
  h.id === 'sk_am_cleanse' ? { ...h, icon: 'Dumbbell', duration: 45 } : h) }
const kept = backfillFromSeed(chosen).habits.find(h => h.id === 'sk_am_cleanse')
ok(kept.icon === 'Dumbbell' && kept.duration === 45, 'a habit that already has one keeps it')

ok(backfillFromSeed(R) === R, 'a routine that needs nothing is returned unchanged, not rebuilt')
ok(backfillFromSeed(blankRoutine()) === blankRoutine() ||
   backfillFromSeed(blankRoutine()).habits.length === 0, 'a blank routine survives it')

console.log(fail ? `\n${fail} FAILED` : '\nAll checks passed')
process.exit(fail ? 1 : 0)
