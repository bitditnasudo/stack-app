/* ============================================================================
   STORE — local-first day logs, with a legacy import and a sync slot.
   ============================================================================
   Kept deliberately close to the template's store so the conflict-safe
   `mergeStates` carries over unchanged. The one adaptation: STACK's records are
   DAY LOGS, and a day log is addressed by its own local date key. So

       item.id === 'YYYY-MM-DD'

   which means the template's "union by id, newest updatedAt wins, tombstones
   survive" merge is already the right merge for this app — two devices that
   ticked different boxes on the same day resolve by last edit, as they should.

   Day log shape:
     { id: '2026-08-10', checked: { taskId: true }, total: 15, updatedAt }

   `total` is stored, not recomputed, because the protocol can change. A Tuesday
   logged as 9/9 before a new evening step was added must keep reading 100% —
   recomputing the denominator would silently rewrite history to 9/10.
   ========================================================================== */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { STORAGE_KEY } from '../app.config.jsx'
import { getLocalDateKey, isDateKey } from './dates.js'

const EMPTY = {
  items: [],                       // day logs, id = local date key
  deleted: {},                     // id → ISO timestamp (tombstones survive a merge)
  // STACK has no onboarding flow — it has nothing to configure before use — so
  // the gate the template ships is satisfied from the start. Kept in the shape
  // so a future first-run screen is a one-line change, not a refactor.
  settings: { onboardingDone: true, legacyImported: false, notifyAsked: false },
  settingsUpdatedAt: null,
  profile: { name: '' },
  profileUpdatedAt: null,
}

const StoreCtx = createContext(null)

const now = () => new Date().toISOString()

export function StoreProvider({ children }) {
  const [state, setState] = useState(loadLocal)
  const [sync, setSync] = useState({ busy: false, error: null, lastSyncedAt: null })
  const hydrated = useRef(false)   // skip the very first write: nothing changed yet

  useEffect(() => {
    if (!hydrated.current) { hydrated.current = true; return }
    saveLocal(state)
  }, [state])

  /* ── One-time import of the GitHub Pages build's data ──────────────────────
     The old app wrote one localStorage entry per day (`stack_checked_<key>` and
     `stack_total_<key>`). On the SAME origin those are still sitting there, so
     folding them in is free. On Vercel this is a different origin and finds
     nothing — that history has to arrive via importBackup() instead. Runs once,
     then latches, so re-editing a day can't be undone by a later reload.      */
  useEffect(() => {
    if (state.settings.legacyImported) return
    const legacy = readLegacyDays()
    setState(s => ({
      ...s,
      items: mergeDayLogs(s.items, legacy),
      settings: { ...s.settings, legacyImported: true },
      settingsUpdatedAt: now(),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Day logs ────────────────────────────────────────────────────────────*/

  const getDay = useCallback(
    key => state.items.find(i => i.id === key) || null,
    [state.items],
  )

  /** Flip one task on one day. `total` is passed in so the denominator is
   *  recorded at the moment it was true. */
  const toggleTask = useCallback((dateKey, taskId, total) => {
    setState(s => {
      const existing = s.items.find(i => i.id === dateKey)
      const checked = { ...(existing?.checked || {}) }
      if (checked[taskId]) delete checked[taskId]   // delete, don't store false —
      else checked[taskId] = true                   // keeps the blob small and
      const next = {                                // makes counting a key count
        id: dateKey,
        checked,
        total: total ?? existing?.total ?? 0,
        updatedAt: now(),
        createdAt: existing?.createdAt || now(),
      }
      return {
        ...s,
        items: existing
          ? s.items.map(i => (i.id === dateKey ? next : i))
          : [...s.items, next],
      }
    })
  }, [])

  /** Make sure today's log exists with the right denominator, even at 0 done.
   *  Without this a day you opened but didn't tick scores "no data" instead of
   *  0% — the recap needs to tell those two apart. */
  const ensureDay = useCallback((dateKey, total) => {
    setState(s => {
      const existing = s.items.find(i => i.id === dateKey)
      if (existing && existing.total === total) return s
      const next = {
        id: dateKey,
        checked: existing?.checked || {},
        total,
        updatedAt: existing?.updatedAt || now(),
        createdAt: existing?.createdAt || now(),
      }
      return {
        ...s,
        items: existing
          ? s.items.map(i => (i.id === dateKey ? next : i))
          : [...s.items, next],
      }
    })
  }, [])

  const resetDay = useCallback(dateKey => {
    setState(s => ({
      ...s,
      items: s.items.map(i => (i.id === dateKey ? { ...i, checked: {}, updatedAt: now() } : i)),
    }))
  }, [])

  /* ── Settings & profile ──────────────────────────────────────────────────*/

  const setSettings = useCallback(patch => {
    setState(s => ({ ...s, settings: { ...s.settings, ...patch }, settingsUpdatedAt: now() }))
  }, [])

  const setProfile = useCallback(patch => {
    setState(s => ({ ...s, profile: { ...s.profile, ...patch }, profileUpdatedAt: now() }))
  }, [])

  const resetAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setState(EMPTY)
  }, [])

  /* ── Backup ──────────────────────────────────────────────────────────────
     The origin changed when this app moved off GitHub Pages, and localStorage
     does not follow an origin change. Export/import is the bridge — and it
     stays useful afterwards as the only backup this app has.                 */

  const exportBackup = useCallback(() => JSON.stringify({
    format: 'stack-backup',
    version: 1,
    exportedAt: now(),
    state,
  }, null, 2), [state])

  /** Accepts either a STACK backup blob or a bare legacy `{key: {taskId:true}}`
   *  dump, and merges rather than replaces — importing twice is harmless. */
  const importBackup = useCallback(raw => {
    let parsed
    try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw }
    catch { throw new Error('That is not valid JSON.') }

    let incoming
    if (parsed?.format === 'stack-backup' && parsed.state) {
      incoming = parsed.state.items || []
    } else if (Array.isArray(parsed?.items)) {
      incoming = parsed.items
    } else if (parsed && typeof parsed === 'object') {
      incoming = normaliseLegacyDump(parsed)
    } else {
      throw new Error('Unrecognised backup format.')
    }
    if (!incoming.length) throw new Error('No day records found in that file.')

    setState(s => ({ ...s, items: mergeDayLogs(s.items, incoming) }))
    return incoming.length
  }, [])

  /* ── Sync slot ───────────────────────────────────────────────────────────
     Unused today. Hand `pullAndMerge` a function returning a remote state and
     the merge below is already conflict-safe; only the transport is missing. */

  const pullAndMerge = useCallback(async pull => {
    setSync(s => ({ ...s, busy: true, error: null }))
    try {
      const remote = await pull()
      if (remote) setState(local => mergeStates(local, remote))
      setSync({ busy: false, error: null, lastSyncedAt: now() })
    } catch (e) {
      setSync(s => ({ ...s, busy: false, error: e.message }))
    }
  }, [])

  const value = useMemo(() => ({
    state, sync,
    getDay, toggleTask, ensureDay, resetDay,
    setSettings, setProfile, resetAll,
    exportBackup, importBackup, pullAndMerge,
  }), [state, sync, getDay, toggleTask, ensureDay, resetDay,
       setSettings, setProfile, resetAll, exportBackup, importBackup, pullAndMerge])

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore() {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}

/* ── Merge ─────────────────────────────────────────────────────────────────*/

/** Union two day-log lists by date key; newest edit wins. */
export function mergeDayLogs(local, incoming) {
  const byId = new Map()
  for (const d of incoming) if (isDateKey(d.id)) byId.set(d.id, d)
  for (const d of local) {
    const cur = byId.get(d.id)
    if (!cur || (d.updatedAt || '') > (cur.updatedAt || '')) byId.set(d.id, d)
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
}

/** Full-state merge — from the template, unchanged. */
export function mergeStates(local, remote) {
  const deleted = { ...(remote.deleted || {}) }
  for (const [id, ts] of Object.entries(local.deleted || {})) {
    if (!deleted[id] || ts > deleted[id]) deleted[id] = ts
  }

  const items = mergeDayLogs(local.items || [], remote.items || [])
    .filter(i => !(deleted[i.id] && deleted[i.id] > (i.updatedAt || '')))

  const settingsLocal = !!local.settingsUpdatedAt && local.settingsUpdatedAt >= (remote.settingsUpdatedAt || '')
  const profileLocal  = !!local.profileUpdatedAt  && local.profileUpdatedAt  >= (remote.profileUpdatedAt  || '')

  return {
    ...remote, ...local,
    items,
    deleted,
    settings:          settingsLocal ? local.settings          : remote.settings,
    settingsUpdatedAt: settingsLocal ? local.settingsUpdatedAt : remote.settingsUpdatedAt,
    profile:           profileLocal  ? local.profile           : remote.profile,
    profileUpdatedAt:  profileLocal  ? local.profileUpdatedAt  : remote.profileUpdatedAt,
  }
}

/* ── Legacy ────────────────────────────────────────────────────────────────*/

const LEGACY_CHECKED = /^stack_checked_(\d{4}-\d{2}-\d{2})$/
const LEGACY_TOTAL   = 'stack_total_'

/** Scrape the old per-day keys off this origin's localStorage. */
function readLegacyDays() {
  const out = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      const m = k && LEGACY_CHECKED.exec(k)
      if (!m) continue
      const dateKey = m[1]
      const checked = pruneFalse(JSON.parse(localStorage.getItem(k) || '{}'))
      const total = parseInt(localStorage.getItem(LEGACY_TOTAL + dateKey) || '0', 10) || 0
      // Stamped at the end of that day so a genuine later edit always wins.
      out.push({ id: dateKey, checked, total, updatedAt: `${dateKey}T23:59:59.000Z`, createdAt: `${dateKey}T00:00:00.000Z` })
    }
  } catch { /* private mode, or a malformed entry — import what parsed */ }
  return out
}

/** Turn a pasted `{ '2026-08-01': {taskId:true}, … }` dump into day logs. */
function normaliseLegacyDump(obj) {
  const out = []
  for (const [k, v] of Object.entries(obj)) {
    if (!isDateKey(k) || !v || typeof v !== 'object') continue
    const checked = pruneFalse(v.checked || v)
    out.push({
      id: k,
      checked,
      total: Number(v.total) || Object.keys(checked).length,
      updatedAt: v.updatedAt || `${k}T23:59:59.000Z`,
      createdAt: `${k}T00:00:00.000Z`,
    })
  }
  return out
}

/** The old writer stored `false` for un-ticked boxes; this one omits them. */
function pruneFalse(o) {
  const out = {}
  for (const [k, v] of Object.entries(o || {})) if (v) out[k] = true
  return out
}

/* ── Persistence ───────────────────────────────────────────────────────────
   Swap these two for idb if the data ever outgrows localStorage. At one small
   record per day that is roughly a century away, so it won't.                */

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    // spread over EMPTY so a schema addition never lands as undefined
    const saved = JSON.parse(raw)
    return { ...EMPTY, ...saved, settings: { ...EMPTY.settings, ...saved.settings } }
  } catch {
    return EMPTY
  }
}

function saveLocal(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // quota exceeded or private mode — the app keeps working in memory
  }
}

/* ── Today ─────────────────────────────────────────────────────────────────*/

/**
 * The current local date key, kept live.
 *
 * The original app had no midnight reset at all: it read the date once at load,
 * so a phone left open overnight showed yesterday's ticked checklist as today's.
 * The patch was a full `window.location.reload()` on tab focus. This does the
 * same job without dropping state — it re-checks on focus AND arms a timer for
 * the next local midnight, so the rollover happens even if the app is just
 * sitting on screen.
 */
export function useTodayKey() {
  const [key, setKey] = useState(() => getLocalDateKey())

  useEffect(() => {
    let timer
    const check = () => {
      const k = getLocalDateKey()
      setKey(prev => (prev === k ? prev : k))
      arm()
    }
    const arm = () => {
      clearTimeout(timer)
      const next = new Date()
      next.setHours(24, 0, 0, 500)          // just past local midnight
      // setTimeout saturates above ~24.8 days; the gap is always < 24h here.
      timer = setTimeout(check, next - Date.now())
    }
    const onVisible = () => { if (document.visibilityState === 'visible') check() }

    arm()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  return key
}
