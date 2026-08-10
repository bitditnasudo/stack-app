/* ============================================================================
   NOTIFICATIONS — in-page timers, honestly labelled.
   ============================================================================
   Ported from the original with its limitation intact and its limitation now
   *stated in the UI*, which it wasn't before.

   How it works: on load (and whenever the tab becomes visible) we arm a
   setTimeout for every entry in NOTIF_SCHEDULE that is due later today, then
   hand the firing to the service worker registration so the notification
   survives the tab being backgrounded.

   What it cannot do: fire when the app has been closed or evicted from memory.
   That needs either the Notification Triggers API (Chromium-only, still behind
   a flag) or a push service with a server. Neither is in scope, so the Settings
   page says so rather than implying reliability the code doesn't have.
   ========================================================================== */

import { NOTIF_SCHEDULE } from './protocol.js'

let timers = []

export function supportsNotifications() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission() {
  return supportsNotifications() ? Notification.permission : 'unsupported'
}

export function clearScheduled() {
  timers.forEach(clearTimeout)
  timers = []
}

/**
 * Arm today's remaining reminders. Idempotent — safe to call on every focus,
 * which is what keeps it correct after the device wakes from sleep.
 * Returns the entries it actually armed, so the UI can show what's pending.
 */
export function scheduleToday() {
  if (notificationPermission() !== 'granted') return []

  clearScheduled()
  const now = new Date()
  const today = now.getDay()
  const armed = []

  for (const n of NOTIF_SCHEDULE) {
    if (!n.days.includes(today)) continue

    const fireAt = new Date()
    fireAt.setHours(n.hour, n.min, 0, 0)
    const delay = fireAt - now
    if (delay <= 0) continue                 // already passed today

    timers.push(setTimeout(async () => {
      try {
        // Go through the SW registration, not `new Notification()` — the latter
        // is unsupported on Android Chrome and throws.
        const reg = await navigator.serviceWorker.ready
        reg.showNotification(n.title, {
          body: n.body,
          tag: n.id,                          // replaces, never stacks duplicates
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          vibrate: [200, 100, 200, 100, 200],
          requireInteraction: false,
          data: { url: '/' },
        })
      } catch { /* SW not ready — nothing useful to do from a timer */ }
    }, delay))

    armed.push({ ...n, fireAt })
  }

  return armed
}

export async function requestPermission() {
  if (!supportsNotifications()) return 'unsupported'
  const perm = await Notification.requestPermission()
  if (perm === 'granted') scheduleToday()
  return perm
}

/** "18:20" in the user's locale — used to list what's armed. */
export function formatFireTime(n) {
  const d = new Date()
  d.setHours(n.hour, n.min, 0, 0)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** Which entries apply to a given JS day index. */
export function scheduleForDay(jsDay) {
  return NOTIF_SCHEDULE.filter(n => n.days.includes(jsDay))
}
