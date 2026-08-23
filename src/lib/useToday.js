/* ============================================================================
   useToday — the one place today's sequence and today's score are derived.
   ============================================================================
   Today and the Home dashboard both need "what's on today and how much of it is
   done". Deriving that twice is how the two screens drift out of agreement,
   which is the bug class this hook exists to prevent.

   WAITS ARE NOT ACHIEVEMENTS. A day's steps include waits; its SCORE counts
   only habit steps. Ticking off "wait 13 minutes" is not progress, and folding
   waits into the denominator would make a rest day with four gaps score lower
   than the same day with none.

   COMPLETION IS READ THROUGH `stepDoneIn`, NEVER BY INDEXING `checked`
   DIRECTLY. A day log may be keyed by step id (v3) or by habit id (every
   version before it), and that helper is the only thing that knows both. An
   `if (checked[x])` anywhere else is a screen that silently disagrees with this
   one about a day logged last March.
   ========================================================================== */

import { useMemo, useEffect } from 'react'
import { useStore, useTodayKey } from './store.jsx'
import {
  stepsForDay, dayKindFor, stepsByCategory, totalWaitMinutes, totalDayMinutes,
  stepDoneIn, dayProgress,
} from './routine.js'

export function useToday() {
  const { state, routine, getDay, ensureDay, toggleTask, resetDay } = useStore()
  const todayKey = useTodayKey()

  // Rebuilt whenever the date key or the routine changes, so both a midnight
  // rollover and an edit to the routine land without a reload.
  const date  = useMemo(() => new Date(`${todayKey}T12:00:00`), [todayKey])
  const steps = useMemo(() => stepsForDay(routine, date.getDay()), [routine, date])
  const kind  = useMemo(() => dayKindFor(routine, date.getDay()), [routine, date])

  const log = getDay(todayKey)
  const checked = log?.checked || {}

  const habitSteps = useMemo(() => steps.filter(s => s.kind === 'habit'), [steps])

  /* The first step of each habit, which is the only one a pre-v3 tick could
     have referred to. Held as a Set of step ids so `isDone` and the toggle
     agree on which row owns a legacy key without either recomputing it. */
  const firstStepIds = useMemo(() => {
    const seen = new Set()
    const out = new Set()
    for (const s of habitSteps) {
      if (seen.has(s.habitId)) continue
      seen.add(s.habitId)
      out.add(s.id)
    }
    return out
  }, [habitSteps])

  // Record the day (and its denominator) as soon as it's viewed, so a day you
  // opened but didn't tick scores 0% rather than "no data". Re-stamps `total`
  // when the routine changes — only for TODAY; past days keep the total they
  // were logged with, which is the whole reason `total` is stored.
  useEffect(() => { ensureDay(todayKey, habitSteps.length) }, [todayKey, habitSteps.length, ensureDay])

  const isDone = step => stepDoneIn(checked, step, habitSteps)

  const done  = habitSteps.filter(isDone).length
  const total = habitSteps.length
  const pct   = total ? Math.round((done / total) * 100) : 0

  /* How much of the WAKING DAY has gone, which is a different question from how
     much of the stack is done and is shown beside it rather than instead of it.
     One is a clock you do not control and the other is work you do; a day can
     be 80% elapsed and 20% done, and that gap is the useful reading. */
  const elapsedPct = dayProgress(state.settings.wakeTime, state.settings.sleepTime)

  return {
    todayKey, date, steps, habitSteps, kind, checked,
    done, total, pct, elapsedPct, isDone,
    waitMinutes: totalWaitMinutes(steps),
    dayMinutes: totalDayMinutes(steps),
    byCategory: stepsByCategory(routine, steps, checked),
    toggle: step => toggleTask(
      todayKey, step.id, habitSteps.length,
      // Only the first occurrence can own a legacy habit-id key; handing it to
      // any other row would let un-ticking the third glass of water clear the
      // first one's tick.
      firstStepIds.has(step.id) ? step.habitId : null,
    ),
    reset:  () => resetDay(todayKey),
    items: state.items,
  }
}
