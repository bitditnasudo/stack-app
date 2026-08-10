/* ============================================================================
   APP — provider → router → shell → routes.
   ============================================================================
   The template's onboarding gate is deliberately absent: STACK has nothing to
   configure before first use, so a gate would be a screen that exists only to
   be dismissed. `settings.onboardingDone` still defaults true in the store, so
   adding a first-run flow later is a one-line change here, not a refactor.

   No FAB either — STACK has no create verb. Its records are generated from the
   protocol, not entered by hand.
   ========================================================================== */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { StoreProvider } from './lib/store.jsx'
import { AppShell } from './components/AppShell.jsx'
import Today from './pages/Today.jsx'
import Overview from './pages/Overview.jsx'
import Recap from './pages/Recap.jsx'
import Settings from './pages/Settings.jsx'

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/"         element={<Today />} />
            <Route path="/overview" element={<Overview />} />
            <Route path="/recap"    element={<Recap />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*"         element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </StoreProvider>
  )
}
