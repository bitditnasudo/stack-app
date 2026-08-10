/* ============================================================================
   DATES — every date key in STACK is a LOCAL calendar date. Never UTC.
   ============================================================================
   This file exists because of a shipped bug. The original app keyed days with
   `toISOString().slice(0,10)`, which is UTC. Arath is at a negative UTC offset,
   so between local midnight and UTC midnight the key pointed at *tomorrow* —
   the day's checklist appeared already-reset in the evening, and the recap
   attributed completions to the wrong day.

   `getLocalDateKey` reads the local calendar fields directly, so the key can
   never shift with the timezone. Nothing in this app may format a date key any
   other way.
   ========================================================================== */

export const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Monday-first labels, for the week strip and the recap grid. */
export const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** `YYYY-MM-DD` from the LOCAL calendar. The only legal date-key format. */
export function getLocalDateKey(d = new Date()) {
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** True if the string is a well-formed date key. Used to filter legacy keys. */
export function isDateKey(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

/**
 * Midnight on the Monday of the week containing `from`, shifted by
 * `offsetWeeks` (0 = this week, -1 = last week). The week starts Monday because
 * the training split does: Mon/Wed/Fri gym, Sat mobility, Sun active skincare.
 */
export function getWeekStartMonday(offsetWeeks = 0, from = new Date()) {
  const daysSinceMonday = (from.getDay() + 6) % 7
  const mon = new Date(from)
  mon.setDate(from.getDate() - daysSinceMonday + offsetWeeks * 7)
  mon.setHours(0, 0, 0, 0)
  return mon
}

/** The seven Date objects of that week, Monday first. */
export function getWeekDates(offsetWeeks = 0, from = new Date()) {
  const mon = getWeekStartMonday(offsetWeeks, from)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon)
    d.setDate(mon.getDate() + i)
    return d
  })
}

/** "Mon, Aug 10" — the line under the page title on Today. */
export function formatLongDay(d = new Date()) {
  return `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`
}

/** "4 Aug – 10 Aug", for the recap week pill when it isn't this/last week. */
export function formatWeekRange(mon) {
  const end = new Date(mon)
  end.setDate(mon.getDate() + 6)
  return `${mon.getDate()} ${MONTH_NAMES[mon.getMonth()]} – ${end.getDate()} ${MONTH_NAMES[end.getMonth()]}`
}
