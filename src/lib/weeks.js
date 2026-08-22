/* ============================================================================
   WEEKS — turn stored day logs into a Monday-first week, with its stats.
   ============================================================================
   `pct === null` means NO DATA — the day was never opened. That is not the same
   as 0%, which means it was opened and nothing was ticked. The original app
   collapsed both into a red bar, so every day before install looked like a
   failure and the average was meaningless.
   ========================================================================== */

import { getWeekDates, getLocalDateKey, WEEK_LABELS, MONTH_NAMES } from './dates.js'
import { dayKindFor } from './routine.js'

/**
 * @param items   day logs from the store
 * @param offset  0 = this week, -1 = last week
 * @param routine the current routine — supplies each day's badge
 *
 * The badge is computed from the routine AS IT IS NOW, not as it was during the
 * week being shown: renaming "Gym" to "Lifting" relabels past Mondays too. That
 * is the honest trade — the alternative is versioning the routine and storing a
 * pointer on every day log, which buys a label nobody is looking back for. The
 * numbers, which people DO look back for, are unaffected: `done` and `total`
 * both come from the stored log, never from the routine.
 */
export function buildWeek(items, offset = 0, routine) {
  const byId = new Map(items.map(i => [i.id, i]))
  const todayKey = getLocalDateKey()
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999)

  return getWeekDates(offset).map((d, i) => {
    const key = getLocalDateKey(d)
    const log = byId.get(key)
    const total = log?.total || 0
    const done = log ? Object.values(log.checked || {}).filter(Boolean).length : 0
    const isToday = key === todayKey
    const isFuture = d > endOfToday

    return {
      key,
      date: d,
      label: WEEK_LABELS[i],
      jsDay: d.getDay(),
      kind: dayKindFor(routine, d.getDay()),
      done,
      total,
      pct: total > 0 ? Math.round((done / total) * 100) : null,
      isToday,
      isFuture,
      title: `${WEEK_LABELS[i]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}${
        total > 0 ? ` — ${done}/${total}` : isFuture ? ' — upcoming' : ' — no data'
      }`,
    }
  })
}

/**
 * Average / best / current perfect-day streak.
 *
 * Only days with data and not in the future count — otherwise Wednesday's 100%
 * gets averaged against four unlived days and reports 29%.
 *
 * The streak counts backwards from the most recent LOGGED day, so it survives a
 * day you simply didn't open, and stops at the first day that wasn't perfect.
 */
export function weekStats(week) {
  const logged = week.filter(d => d.pct !== null && !d.isFuture)
  if (!logged.length) return { avg: null, best: null, streak: 0, loggedCount: 0 }

  const avg  = Math.round(logged.reduce((s, d) => s + d.pct, 0) / logged.length)
  const best = Math.max(...logged.map(d => d.pct))

  let streak = 0
  for (let i = logged.length - 1; i >= 0; i--) {
    if (logged[i].pct === 100) streak++
    else break
  }

  return { avg, best, streak, loggedCount: logged.length }
}
