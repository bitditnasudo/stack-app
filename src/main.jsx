import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

/* Optional: behave like an app, not a web page.
 *
 * iOS deliberately ignores `user-scalable=no`, so a pinch still zooms the whole
 * layout and then lets the user drag it around. These Safari-only gesture
 * events are the one hook that actually suppresses it.
 *
 * Left OFF for STACK. The old app set `maximum-scale=1, user-scalable=no` in
 * its viewport tag, which is both ignored by iOS and an accessibility
 * regression on Android. STACK is a checklist — nothing here needs a gesture
 * surface of its own, so pinch-zoom stays available.
 */
const LOCK_PINCH_ZOOM = false

if (LOCK_PINCH_ZOOM) {
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, e => e.preventDefault(), { passive: false })
  }
}

/* Service worker. STACK is no longer an installable PWA, and this is still
 * here: notifications fire through the REGISTRATION
 * (`registration.showNotification`), because `new Notification()` throws on
 * Android Chrome. Losing the worker loses the reminders, tab or no tab.
 *
 * Registered from the origin root so its scope covers the whole app — a worker
 * served from /assets/ would control nothing. Registered after `load` so it
 * never competes with the first paint. */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // No SW means no offline and no notifications, but the app still works.
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
