/* ============================================================================
   useToday — the one place today's checklist and today's score are derived.
   ============================================================================
   Today and Overview both need "what's on today and how much of it is done".
   Deriving that twice is how the two screens drift out of agreement, which is
   the bug class this hook exists to prevent.

   It now also depends on the ROUTINE, which the user can edit mid-day. Every
   derivation below keys off `routine` as well as the date, so saving an edit
   re-renders the checklist immediately — including the denominator.
   ========================================================================== */

import { useMemo, useEffect } from 'react'
import { useStore, useTodayKey } from './store.jsx'
import { tasksForDate, dayKindFor, tasksByTag } from './routine.js'

export function useToday() {
  const { state, routine, getDay, ensureDay, toggleTask, resetDay } = useStore()
  const todayKey = useTodayKey()

  // Rebuilt whenever the date key or the routine changes, so both a midnight
  // rollover (Sunday's actives → Monday's actives + gym) and an edit to the
  // protocol land without a reload.
  const date  = useMemo(() => new Date(`${todayKey}T12:00:00`), [todayKey])
  const tasks = useMemo(() => tasksForDate(routine, date), [routine, date])
  const kind  = useMemo(() => dayKindFor(routine, date.getDay()), [routine, date])

  const log = getDay(todayKey)
  const checked = log?.checked || {}

  // Record the day (and its denominator) as soon as it's viewed, so a day you
  // opened but didn't tick scores 0% rather than "no data".
  //
  // This also re-stamps `total` when the routine changes, which is what makes
  // adding a task mid-day move today from 8/8 to 8/9 instead of leaving a
  // stale denominator. Only TODAY is re-stamped — past days keep the total they
  // were logged with, which is the whole reason `total` is stored.
  useEffect(() => { ensureDay(todayKey, tasks.length) }, [todayKey, tasks.length, ensureDay])

  const done  = tasks.filter(t => checked[t.id]).length
  const total = tasks.length
  const pct   = total ? Math.round((done / total) * 100) : 0

  return {
    todayKey, date, tasks, kind, checked,
    done, total, pct,
    /* [{ tag, done, total }] for every tag with a task today — the Overview
       split. It used to be a hardcoded supplements/skincare pair; the tags are
       the user's now, so the breakdown follows whatever they made. */
    byTag: tasksByTag(routine, tasks, checked),
    toggle: id => toggleTask(todayKey, id, tasks.length),
    reset:  () => resetDay(todayKey),
    items: state.items,
  }
}
