/* ============================================================================
   useToday — the one place today's sequence and today's score are derived.
   ============================================================================
   Today and Overview both need "what's on today and how much of it is done".
   Deriving that twice is how the two screens drift out of agreement, which is
   the bug class this hook exists to prevent.

   WAITS ARE NOT ACHIEVEMENTS. A day's steps include waits; its SCORE counts
   only habit steps. Ticking off "wait 13 minutes" is not progress, and folding
   waits into the denominator would make a rest day with four gaps score lower
   than the same day with none.
   ========================================================================== */

import { useMemo, useEffect } from 'react'
import { useStore, useTodayKey } from './store.jsx'
import { stepsForDay, dayKindFor, stepsByCategory, totalWaitMinutes } from './routine.js'

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

  // Record the day (and its denominator) as soon as it's viewed, so a day you
  // opened but didn't tick scores 0% rather than "no data". Re-stamps `total`
  // when the routine changes — only for TODAY; past days keep the total they
  // were logged with, which is the whole reason `total` is stored.
  useEffect(() => { ensureDay(todayKey, habitSteps.length) }, [todayKey, habitSteps.length, ensureDay])

  const done  = habitSteps.filter(s => checked[s.habitId]).length
  const total = habitSteps.length
  const pct   = total ? Math.round((done / total) * 100) : 0

  return {
    todayKey, date, steps, habitSteps, kind, checked,
    done, total, pct,
    waitMinutes: totalWaitMinutes(steps),
    byCategory: stepsByCategory(routine, steps, checked),
    toggle: habitId => toggleTask(todayKey, habitId, habitSteps.length),
    reset:  () => resetDay(todayKey),
    items: state.items,
  }
}
