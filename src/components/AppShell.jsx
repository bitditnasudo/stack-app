/* ============================================================================
   APP SHELL — the chrome every app in the family shares.
   ============================================================================
   One <nav> element serves both layouts: a floating pill bar on phones, a
   sticky sidebar from 700px up. Only CSS switches between them, so there is no
   duplicated markup and no breakpoint listener in JS.

   Configure with NAV_ITEMS + the `fab` prop; don't fork the component.
   ========================================================================== */

import { useNavigate, useLocation } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { APP_NAME, NAV_ITEMS, BrandMark } from '../app.config.jsx'

function BottomNav({ fab }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const renderItem = ({ icon: Icon, label, to }) => {
    const active = pathname === to
    return (
      <button
        key={to}
        className="nav-item"
        aria-current={active ? 'page' : undefined}
        onClick={() => navigate(to)}
      >
        {active
          ? <div className="nav-pill"><Icon size={14} /><span>{label}</span></div>
          : <><Icon size={20} /><span className="nav-label">{label}</span></>}
      </button>
    )
  }

  // Four tabs plus the action pill can't all carry a label on a phone — the
  // pill would overflow the bar. This flags the bar as dense so CSS can drop
  // inactive labels to icons at phone widths only, and only when the count
  // actually demands it. Three tabs keep their labels.
  const dense = NAV_ITEMS.length >= 4

  return (
    <nav className={`bottom-nav${dense ? ' bottom-nav-dense' : ''}`} aria-label="Main">
      {/* sidebar-only identity — hidden in the phone bar */}
      <div className="nav-brand">
        <div className="nav-brand-icon"><BrandMark size={22} /></div>
        <span>{APP_NAME}</span>
      </div>

      {NAV_ITEMS.map(renderItem)}

      {/* The primary action closes the bar — it's an action, not a destination,
          so it sits after every tab rather than among them. On the phone bar it
          renders as a pill to match the bar and the active tab; in the sidebar
          it becomes a labelled block button (see .fab in index.css). */}
      {fab && (
        <button className="fab" onClick={fab.onClick} aria-label={fab.label}>
          <Plus size={22} />
          <span className="fab-label">{fab.label}</span>
        </button>
      )}
    </nav>
  )
}

/**
 * Wrap the routed pages.
 *   <AppShell fab={{ label: 'New thing', onClick: open }} blobs>
 *     <Routes>…</Routes>
 *   </AppShell>
 *
 * `blobs` turns on the decorative background shapes (Plant Tracker style);
 * leave it off for a flat page (Budget style).
 */
export function AppShell({ fab, blobs, children }) {
  return (
    <div className="app-shell">
      {blobs && <div className="bg-blobs" />}
      {children}
      <BottomNav fab={fab} />
    </div>
  )
}

/**
 * Page header: avatar → greeting → trailing actions. Every dashboard in the
 * family opens with this, which is most of why they feel related.
 */
export function PageHeader({ avatar, eyebrow, title, onAvatarClick, actions }) {
  return (
    <header className="header">
      {avatar && (
        <button className="avatar" onClick={onAvatarClick} aria-label="Account">
          {avatar}
        </button>
      )}
      <div className="hello">
        {eyebrow && <small>{eyebrow}</small>}
        <b>{title}</b>
      </div>
      {actions}
    </header>
  )
}
