/* Domain assertions — `node verify.mjs`.
 *
 * Three jobs now. The seed still classifies the week correctly and still uses
 * the fifteen habit ids history is keyed by. The v2 engine holds up under
 * edits. And the v1→v2 MIGRATION carries a real v1 document across without
 * dropping a task or renaming an id — that one matters most, because getting it
 * wrong silently orphans eight months of logs. */

import { defaultRoutine, blankRoutine } from './src/lib/protocol.js'
import {
  stepsForDay, habitStepsForDay, dayKindFor, templateForDay, daysForTemplate,
  habitDays, isUnusedHabit, stepsByCategory, totalWaitMinutes, formatWait,
  notifScheduleFor, normaliseRoutine, formatTime,
  upsertHabit, removeHabit, removeCategory, removeTemplate,
  addHabitStep, addWaitStep, removeStep, moveStep, updateStep,
  assignDay, setTemplateDays, setHabitDays,
  ALL_DAYS, PALETTE,
} from './src/lib/routine.js'
import { getLocalDateKey, getWeekDates, getWeekStartMonday } from './src/lib/dates.js'
import { weekStats } from './src/lib/weeks.js'

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
ok(addHabitStep(withNew, 't1', 'h_am').templates[0].steps.length === 3, 'adding the same habit twice is a no-op')

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
ok(M !== null && M.version === 2, 'a v1 document migrates to v2')
ok(M.habits.map(h => h.id).sort().join() === ['sk_am_cleanse', 'sk_am_vitc', 'ablazor', 'sk_pm_retinol'].sort().join(),
   'EVERY v1 task id survives the migration unchanged — history still lines up')
ok(M.habits.length === V1.tasks.length, 'no task is dropped')
ok(M.categories.map(c => c.id).join() === 'skin,supp', 'v1 tags become categories, ids intact')
ok(M.categories.every(c => /^#[0-9A-F]{6}$/i.test(c.color)), 'each migrated category gets a colour')
ok(M.habits.find(h => h.id === 'sk_am_cleanse').time === '06:30', 'a habit inherits its old block start as its time')
ok(M.habits.find(h => h.id === 'ablazor').time === '18:30', 'from the right block')
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

console.log(fail ? `\n${fail} FAILED` : '\nAll checks passed')
process.exit(fail ? 1 : 0)
