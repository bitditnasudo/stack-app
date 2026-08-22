/* ============================================================================
   AUTH CALLBACK — where Google drops the token.
   ============================================================================
   Ported from the Plant Tracker. The implicit flow returns the token in the URL
   FRAGMENT (`#access_token=…`), which never reaches a server — that is the
   whole reason this app can talk to Drive without a backend.

   It lands on /settings rather than the Plant Tracker's /account because that
   is where STACK's Drive card lives.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { storeToken } from '../lib/googleDrive.js'
import { useStore } from '../lib/store.jsx'

export default function AuthCallback() {
  const navigate = useNavigate()
  const { refreshSync } = useStore()
  const processed = useRef(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Guard against StrictMode's double effect invocation — the hash is a
    // one-time value, consumed on the first pass.
    if (processed.current) return
    processed.current = true

    const hash = new URLSearchParams(window.location.hash.replace('#', ''))
    const token = hash.get('access_token')
    const expiry = hash.get('expires_in')

    if (token) {
      storeToken(token, Number(expiry || 3600))
      // Clear the fragment before navigating: a token sitting in the address
      // bar ends up in screenshots and in the back-forward cache.
      window.history.replaceState(null, '', window.location.pathname)
      refreshSync()
      navigate('/settings', { replace: true })
    } else {
      // Shown rather than only console.error'd — "denied the consent screen"
      // and "the client id is wrong" look identical from the outside otherwise.
      const desc = hash.get('error_description') || hash.get('error') || 'No token was returned.'
      setError(desc)
      const t = setTimeout(() => navigate('/settings', { replace: true }), 4000)
      return () => clearTimeout(t)
    }
  }, [navigate, refreshSync])

  return (
    <div className="main-content">
      <div className="empty">
        <h3>{error ? 'Could not connect' : 'Connecting to Google…'}</h3>
        <p>{error || 'One moment.'}</p>
      </div>
    </div>
  )
}
