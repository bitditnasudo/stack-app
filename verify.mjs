import { tasksForDate, isActiveDay, getWorkout, dayKind, buildTasks } from './src/lib/protocol.js'
import { getLocalDateKey, getWeekDates, getWeekStartMonday } from './src/lib/dates.js'
import { weekStats } from './src/lib/weeks.js'

let fail = 0
const ok = (c, m) => { if (!c) { console.log('FAIL:', m); fail++ } else console.log('ok  :', m) }

// ── Day classification: the active/workout split is the bug-prone bit ────────
const names=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
for (let d=0; d<7; d++) {
  const a=isActiveDay(d), w=!!getWorkout(d)
  console.log(`  ${names[d]}: active=${a} workout=${w} tasks=${buildTasks(a,getWorkout(d)).length} kind=${dayKind(d).text}`)
}
ok(isActiveDay(0) && !getWorkout(0), 'Sunday is ACTIVE but has NO workout')
ok(!isActiveDay(2) && !getWorkout(2), 'Tuesday is rest, no workout')
ok(getWorkout(6).label==='Stretch', 'Saturday is the mobility session')
ok(dayKind(6).text==='MOBILITY' && dayKind(1).text==='GYM', 'Sat=MOBILITY, Mon=GYM')

// ── Task counts per day type ────────────────────────────────────────────────
const n = d => buildTasks(isActiveDay(d), getWorkout(d)).length
ok(n(1)===n(3) && n(3)===n(5), 'Mon/Wed/Fri identical task count')
ok(n(2)===n(4), 'Tue/Thu identical')
ok(n(1) > n(0) && n(0) > n(2), 'gym day > sunday-active > rest day')

// ── Task ids are the storage contract: unique, and none renamed ─────────────
const EXPECTED = ['sk_am_cleanse','sk_am_growth','sk_am_vitc','sk_am_ha','sk_am_lub','sk_am_spf',
  'tadalafil','ablazor','whey','creatine','sk_pm_cleanse','sk_pm_ha','sk_pm_retinol','sk_pm_min','sk_pm_lub']
const all = new Set()
for (let d=0; d<7; d++) for (const t of buildTasks(isActiveDay(d), getWorkout(d))) all.add(t.id)
ok([...all].sort().join()===[...EXPECTED].sort().join(), 'task ids match the legacy set exactly (no orphaned history)')
for (let d=0; d<7; d++) {
  const ids = buildTasks(isActiveDay(d), getWorkout(d)).map(t=>t.id)
  if (new Set(ids).size !== ids.length) { console.log('FAIL: duplicate id on day', d); fail++ }
}
ok(true, 'no duplicate ids on any day')

// ── Local date key must never be UTC ────────────────────────────────────────
const late = new Date(2026, 7, 10, 23, 30)   // 11:30pm local on Aug 10
ok(getLocalDateKey(late)==='2026-08-10', 'late-evening date key stays on the local day (UTC bug)')
ok(getLocalDateKey(new Date(2026,0,1))==='2026-01-01', 'month/day zero-padded')

// ── Weeks start Monday ──────────────────────────────────────────────────────
const w = getWeekDates(0, new Date(2026,7,10))     // Mon 10 Aug 2026
ok(w[0].getDay()===1 && w[6].getDay()===0, 'week runs Mon..Sun')
ok(getLocalDateKey(w[0])==='2026-08-10', 'Monday of that week is the 10th')
const sun = getWeekStartMonday(0, new Date(2026,7,16)) // Sun 16 Aug
ok(getLocalDateKey(sun)==='2026-08-10', 'Sunday belongs to the week that began Mon the 10th')

// ── Stats: no-data must not be scored as 0% ─────────────────────────────────
const week = [
  {pct:100,isFuture:false},{pct:100,isFuture:false},{pct:null,isFuture:false},
  {pct:50,isFuture:false},{pct:null,isFuture:true},{pct:null,isFuture:true},{pct:null,isFuture:true},
]
const s = weekStats(week)
ok(s.avg===83, `avg ignores no-data and future days (got ${s.avg}, expected 83)`)
ok(s.best===100, 'best day found')
ok(s.streak===0, 'streak breaks at the 50% day')
const s2 = weekStats([{pct:100,isFuture:false},{pct:50,isFuture:false},{pct:100,isFuture:false},{pct:100,isFuture:false}])
ok(s2.streak===2, `streak counts back from the last logged day (got ${s2.streak})`)
ok(weekStats([{pct:null,isFuture:true}]).avg===null, 'an unlived week reports null, not 0%')

console.log(fail ? `\n${fail} FAILED` : '\nAll checks passed')
process.exit(fail?1:0)
