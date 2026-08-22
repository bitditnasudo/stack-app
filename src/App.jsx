/* ============================================================================
   APP — provider → router → shell → routes.
   ============================================================================
   The template's onboarding gate is deliberately absent: STACK has nothing to
   configure before first use, so a gate would be a screen that exists only to
   be dismissed. `settings.onboardingDone` still defaults true in the store, so
   adding a first-run flow later is a one-line change here, not a refactor.

   No FAB either. STACK gained a create verb when the protocol became editable,
   but it belongs to ONE screen — /routine — rather than to the shell: a global
   "+" on the checklist would sit next to fifteen things that are ticked, not
   created, and its meaning would change per tab. The routine editor carries its
   own add buttons, one per section, where the thing being added is unambiguous.

   /routine is a sub-page, not a fifth tab: the nav bar is full at four and the
   kit drops inactive labels to icons at exactly that count.
   ========================================================================== */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { StoreProvider } from './lib/store.jsx'
import { AppShell } from './components/AppShell.jsx'
import Today from './pages/Today.jsx'
import Overview from './pages/Overview.jsx'
import Recap from './pages/Recap.jsx'
import Settings from './pages/Settings.jsx'
import Routine from './pages/Routine.jsx'
import AuthCallback from './pages/AuthCallback.jsx'

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          {/* Outside the shell on purpose: this route exists for the few
              hundred milliseconds it takes to read Google's token out of the
              URL fragment, and flashing the nav bar behind it makes it look
              like a page you were meant to arrive at. */}
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            path="*"
            element={
              <AppShell>
                <Routes>
                  <Route path="/"         element={<Today />} />
                  <Route path="/overview" element={<Overview />} />
                  <Route path="/recap"    element={<Recap />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/routine"  element={<Routine />} />
                  <Route path="*"         element={<Navigate to="/" replace />} />
                </Routes>
              </AppShell>
            }
          />
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  )
}
