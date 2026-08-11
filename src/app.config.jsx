/* ============================================================================
   APP CONFIG — identity, navigation and storage key for STACK.
   ============================================================================
   Together with theme.css this is the whole "what app is this?" surface.
   STACK runs the Vantarco kit with its own theme — the WINE token set in
   theme.css. Only colour values differ from the template; every token name,
   scale and component rule is the kit's. That is the seam: nothing outside
   theme.css knows what colour this app is.
   ========================================================================== */

import { ListChecks, PieChart, CalendarRange, Settings } from 'lucide-react'

export const APP_NAME  = 'STACK'
export const APP_SHORT = 'STACK'

/** localStorage / sync namespace. Bump the version to invalidate old data.
 *  The v1 → legacy migration in lib/store.jsx reads the *old* per-day keys
 *  (`stack_checked_YYYY-MM-DD`) and folds them in here exactly once. */
export const STORAGE_KEY = 'stack:v1'

/**
 * Four tabs, so the bar marks itself dense: inactive tabs drop to icons and the
 * active tab keeps its label inside its pill. There is no action pill — STACK
 * has no "create" verb, its records are generated from the protocol.
 *
 * Notifications live inside Settings rather than as a fifth tab. Five tabs is
 * over the kit's limit, and the old app's "Notify" page was a permission
 * button plus a read-only schedule — settings content wearing a tab.
 */
export const NAV_ITEMS = [
  { icon: ListChecks,    label: 'Today',    to: '/' },
  { icon: PieChart,      label: 'Overview', to: '/overview' },
  { icon: CalendarRange, label: 'Recap',    to: '/recap' },
  { icon: Settings,      label: 'Settings', to: '/settings' },
]

/** Stacked layers — the app is a stack of daily protocol blocks. */
export function BrandMark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5 20.5 8 12 12.5 3.5 8 12 3.5Z" fill="currentColor" opacity=".22" />
      <path d="M12 3.5 20.5 8 12 12.5 3.5 8 12 3.5Z" stroke="currentColor" strokeWidth="1.6"
            strokeLinejoin="round" />
      <path d="M3.5 12 12 16.5 20.5 12" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 16 12 20.5 20.5 16" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* Build stamp, injected by vite.config.js. Surfaced on the Settings page so a
   deployed build can never be mistaken for a stale one — which is exactly the
   question the old GitHub Pages build could not answer from the phone.

   The fallbacks keep this importable in plain test runners, where the vite
   defines don't exist. */
export const APP_VERSION  = typeof __APP_VERSION__  !== 'undefined' ? __APP_VERSION__  : '0.0.0'
export const BUILD_COMMIT = typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev'
export const BUILD_DATE   = typeof __BUILD_DATE__   !== 'undefined' ? __BUILD_DATE__   : null
export const COMMIT_COUNT = typeof __COMMIT_COUNT__ !== 'undefined' ? __COMMIT_COUNT__ : 0
export const DEPLOY_COUNT = typeof __DEPLOY_COUNT__ !== 'undefined' ? __DEPLOY_COUNT__ : 0
