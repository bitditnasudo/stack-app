/* ============================================================================
   APP — provider → router → shell → routes.
   ============================================================================
   The onboarding gate is now USED. It was absent while STACK had nothing to
   configure before first use; it now has two things — where the data lives, and
   what the week looks like.

   `settings.onboardingDone` still DEFAULTS TRUE, which is what stops every
   existing device seeing the flow on upgrade. Only a store with no saved state
   at all starts it false. That means the gate is invisible to anyone already
   using the app and blocking only for a genuinely fresh install.

   No FAB either. STACK gained a create verb when the protocol became editable,
   but it belongs to ONE screen — /routine — rather than to the shell: a global
   "+" on the checklist would sit next to fifteen things that are ticked, not
   created, and its meaning would change per tab. The routine editor carries its
   own add buttons, one per section, where the thing being added is unambiguous.

   /routine is a sub-page, not a fifth tab: the nav bar is full at four and the
   kit drops inactive labels to icons at exactly that count.
   ========================================================================== */

import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { StoreProvider, useStore } from './lib/store.jsx'
import { AppShell } from './components/AppShell.jsx'
import Today from './pages/Today.jsx'
import Overview from './pages/Overview.jsx'
import Recap from './pages/Recap.jsx'
import Settings from './pages/Settings.jsx'
import Routine from './pages/Routine.jsx'
import BuildWeek from './pages/BuildWeek.jsx'
import AuthCallback from './pages/AuthCallback.jsx'
import Onboarding from './pages/Onboarding.jsx'

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <OnboardingGate />
        <Routes>
          {/* Outside the shell on purpose: this route exists for the few
              hundred milliseconds it takes to read Google's token out of the
              URL fragment, and flashing the nav bar behind it makes it look
              like a page you were meant to arrive at. */}
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/welcome" element={<Onboarding />} />
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
                  {/* Inside the shell on purpose: unlike onboarding this is
                      re-runnable, so the nav has to stay reachable — leaving
                      halfway is a normal way to use it. */}
                  <Route path="/build"    element={<BuildWeek />} />
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

/* Redirects a fresh install to /welcome, once. Rendered inside the router so it
   can navigate, and outside the shell so it never paints. Deliberately does NOT
   block /auth/callback — the OAuth round trip happens mid-onboarding, and
   bouncing it back to /welcome would drop the token before it was stored. */
function OnboardingGate() {
  const { state } = useStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    if (state.settings.onboardingDone) return
    if (pathname === '/welcome' || pathname === '/auth/callback') return
    navigate('/welcome', { replace: true })
  }, [state.settings.onboardingDone, pathname, navigate])

  return null
}
