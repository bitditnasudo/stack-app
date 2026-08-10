/* ============================================================================
   useToday — the one place today's checklist and today's score are derived.
   ============================================================================
   Today and Overview both need "what's on today and how much of it is done".
   Deriving that twice is how the two screens drift out of agreement, which is
   the bug class this hook exists to prevent.
   ========================================================================== */

import { useMemo, useEffect } from 'react'
import { useStore, useTodayKey } from './store.jsx'
import { tasksForDate, dayKind } from './protocol.js'

export function useToday() {
  const { state, getDay, ensureDay, toggleTask, resetDay } = useStore()
  const todayKey = useTodayKey()

  // Rebuilt whenever the date key changes, so a midnight rollover swaps the
  // checklist (Sunday's actives → Monday's actives + gym) without a reload.
  const date  = useMemo(() => new Date(`${todayKey}T12:00:00`), [todayKey])
  const tasks = useMemo(() => tasksForDate(date), [date])
  const kind  = useMemo(() => dayKind(date.getDay()), [date])

  const log = getDay(todayKey)
  const checked = log?.checked || {}

  // Record the day (and its denominator) as soon as it's viewed, so a day you
  // opened but didn't tick scores 0% rather than "no data".
  useEffect(() => { ensureDay(todayKey, tasks.length) }, [todayKey, tasks.length, ensureDay])

  const done  = tasks.filter(t => checked[t.id]).length
  const total = tasks.length
  const pct   = total ? Math.round((done / total) * 100) : 0

  const supp = tasks.filter(t => t.category === 'supp')
  const skin = tasks.filter(t => t.category === 'skin')

  return {
    todayKey, date, tasks, kind, checked,
    done, total, pct,
    supp: { done: supp.filter(t => checked[t.id]).length, total: supp.length },
    skin: { done: skin.filter(t => checked[t.id]).length, total: skin.length },
    toggle: id => toggleTask(todayKey, id, tasks.length),
    reset:  () => resetDay(todayKey),
    items: state.items,
  }
}
