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
     { id: '2026-08-10', checked: { stepId: true }, total: 15, updatedAt }

   `total` is stored, not recomputed, because the protocol can change. A Tuesday
   logged as 9/9 before a new evening step was added must keep reading 100% —
   recomputing the denominator would silently rewrite history to 9/10.

   ── `checked` IS KEYED BY STEP ID AS OF SCHEMA v3, AND WAS KEYED BY HABIT ID
      FOR EVERYTHING BEFORE IT ──────────────────────────────────────────────
   A habit may now appear in one day more than once ("water, four times"), so a
   tick has to say WHICH occurrence; a habit id cannot, and ticking the morning
   cleanse used to tick the evening one. See (A) and (B) in `routine.js`.

   BOTH KINDS OF KEY ARE READ. Nothing rewrites a logged day just because it is
   old: `stepDoneIn` resolves a habit-id key against the first step of that
   habit, which is exact, because no earlier version could produce a second one.
   A day is only rewritten when the user actually toggles a step on it (the
   legacy key is dropped as the step key takes over) or when the ONE-TIME
   library dedupe moves a tick onto the step its removed habit became.
   ========================================================================== */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { STORAGE_KEY, APP_VERSION } from '../app.config.jsx'
import { getLocalDateKey, isDateKey } from './dates.js'
import { defaultRoutine, backfillFromSeed } from './protocol.js'
import { normaliseRoutine, dedupeLibrary, rewriteCheckedIds } from './routine.js'
import {
  isAuthenticated, isConfigured, signIn, clearToken, resolveFolder, folderUrl,
  findSyncFile, createSyncFile, updateSyncFile, downloadSyncFile, AuthExpiredError,
} from './googleDrive.js'

/* Where the Drive sync file is, and when it was last agreed with. Deliberately
   OUTSIDE the synced blob — it is about this device's relationship to the file,
   so syncing it would mean each device overwriting the other's bookkeeping. */
const SYNC_META_KEY = 'stack:sync'
const loadSyncMeta = () => { try { return JSON.parse(localStorage.getItem(SYNC_META_KEY)) || {} } catch { return {} } }
const saveSyncMeta = m => { try { localStorage.setItem(SYNC_META_KEY, JSON.stringify(m)) } catch { /* private mode */ } }

const EMPTY = {
  items: [],                       // day logs, id = local date key
  deleted: {},                     // id → ISO timestamp (tombstones survive a merge)
  // DEFAULTS TRUE, and that is load-bearing. Every device that already has
  // saved state spreads over this default and keeps `true`, so upgrading never
  // shows the first-run flow. Only `loadLocal` finding NO saved blob at all
  // flips it to false — see there.
  settings: {
    onboardingDone: true, legacyImported: false, notifyAsked: false,
    // The one-time library cleanup. DEFAULTS FALSE, unlike `onboardingDone`,
    // because it is a migration rather than a first-run flow: every existing
    // device is exactly what it is there to clean up, so it has to run once on
    // each of them and then latch. It is NOT an ongoing duplicate check —
    // creating two habits with the same name afterwards is allowed.
    libraryDeduped: false,
    // Empty means "never set", and `dayProgress` returns null for it rather
    // than assuming an 07:00–23:00 day nobody chose. Onboarding asks; an
    // upgrading device simply shows no elapsed-day bar until it answers.
    wakeTime: '', sleepTime: '',
  },
  settingsUpdatedAt: null,
  profile: { name: '' },
  profileUpdatedAt: null,
  // The editable protocol. Seeded from protocol.js and the user's from then on.
  // It lives in state (not a separate key) so one export backs up the routine
  // and the history together — restoring a phone with the days but not the
  // checklist that produced them would be a strange thing to hand someone.
  routine: null,                   // null only until loadLocal seeds it
  routineUpdatedAt: null,
}

const StoreCtx = createContext(null)

const now = () => new Date().toISOString()

export function StoreProvider({ children }) {
  const [state, setState] = useState(loadLocal)
  const [sync, setSync] = useState(() => ({
    configured: isConfigured(),
    connected: isAuthenticated(),
    busy: false,
    error: null,
    lastSyncedAt: loadSyncMeta().lastSyncedAt || null,
    folder: null,               // { id, name, pinned } once resolved
  }))
  const hydrated = useRef(false)   // skip the very first write: nothing changed yet

  /* Sync bookkeeping, all refs because none of it should cause a render:
       latest      the freshest state, readable from inside an async push
       dirty       local edits not yet pushed
       busy        a push already in flight — Drive calls are not reentrant
       timer       the debounce
       applying    suppresses the dirty flag while a PULL writes to state,
                   otherwise merging in remote data instantly marks the device
                   dirty and it pushes straight back — a sync loop between two
                   devices that never settles. */
  const latest = useRef(state)
  const dirty = useRef(false)
  /* The dirty effect needs its OWN first-run latch, not `hydrated`. Effects run
     in declaration order, and the save effect above flips `hydrated` to true on
     that same first pass — so by the time the dirty effect runs on mount it
     already reads true, and every cold start marked itself dirty and rewrote
     the Drive file on open. */
  const dirtyFirstRun = useRef(true)
  const syncBusy = useRef(false)
  const syncTimer = useRef(null)
  const applying = useRef(0)
  const syncNowRef = useRef(() => {})

  useEffect(() => { latest.current = state }, [state])

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

  /* ── One-time library dedupe ───────────────────────────────────────────────
     A MIGRATION, NOT A FEATURE. The shipped library carries the same item twice
     under two ids — `sk_am_cleanse`/`sk_pm_cleanse` and two more pairs — because
     schema v2 could not put one habit in a day twice. v3 can, so the workaround
     comes out: see `dedupeLibrary` in routine.js for what merges and why.

     IT REWRITES HISTORY, and that is the part that had to be got right. Removing
     `sk_pm_cleanse` orphans every tick ever recorded under it, so each of those
     ticks is moved onto the exact step the removed habit became. The pre-merge
     id is what makes that exact: it is the only thing that still distinguishes
     the morning cleanse from the evening one.

     Runs once per device, then latches, exactly like the legacy import above. */
  useEffect(() => {
    if (state.settings.libraryDeduped) return
    setState(s => {
      const { routine: merged, merges, rewrites } = dedupeLibrary(s.routine)
      /* Glyphs and durations arrive in the SAME pass, because a v2 device has
         neither and would otherwise never get them — its habits are the seed's
         under the seed's frozen ids, just without the two fields v3 added. It
         only fills empties; see `backfillFromSeed`. */
      const routine = backfillFromSeed(merged)
      const settings = { ...s.settings, libraryDeduped: true }
      const changed = merges.length > 0 || routine !== merged || merged !== s.routine

      if (!changed) return { ...s, settings, settingsUpdatedAt: now() }
      return {
        ...s,
        routine,
        routineUpdatedAt: now(),
        items: rewriteCheckedIds(s.items, routine, merges, rewrites),
        settings,
        settingsUpdatedAt: now(),
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Day logs ────────────────────────────────────────────────────────────*/

  const getDay = useCallback(
    key => state.items.find(i => i.id === key) || null,
    [state.items],
  )

  /**
   * Flip one STEP on one day. `total` is passed in so the denominator is
   * recorded at the moment it was true.
   *
   * `legacyId` is the step's habit id, and it is passed ONLY when this step is
   * the first occurrence of that habit in the day — which is the only step a
   * pre-v3 tick could have meant. Passing it lets the write take the old key
   * over cleanly: without it, un-ticking a step whose tick is still recorded
   * under the habit id deletes a key that isn't there and the row springs back
   * to done on the next render.
   *
   * Days nobody touches are never rewritten. This is a lazy migration on
   * purpose — `stepDoneIn` already reads both shapes, so rewriting history that
   * reads correctly would be churn with a chance of loss and no upside.
   */
  const toggleTask = useCallback((dateKey, stepId, total, legacyId = null) => {
    setState(s => {
      const existing = s.items.find(i => i.id === dateKey)
      const checked = { ...(existing?.checked || {}) }
      const wasDone = !!checked[stepId] || (!!legacyId && !!checked[legacyId])

      if (wasDone) {
        delete checked[stepId]                      // delete, don't store false —
        if (legacyId) delete checked[legacyId]      // keeps the blob small and
      } else {                                      // makes counting a key count
        checked[stepId] = true
      }

      const next = {
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

  /* ── Routine ─────────────────────────────────────────────────────────────
     One mutator for the whole document. `updater` is any pure function from
     routine → routine, which is exactly the shape of every helper exported by
     routine.js, so the editor composes them instead of doing list surgery in a
     component:

         setRoutine(r => upsertTask(r, task))

     Stamping `routineUpdatedAt` here — rather than in each helper — is what
     keeps the helpers pure and testable, and it means no edit path can forget
     the stamp that the merge relies on.                                      */

  const setRoutine = useCallback(updater => {
    setState(s => {
      const next = typeof updater === 'function' ? updater(s.routine) : updater
      if (!next || next === s.routine) return s
      return { ...s, routine: next, routineUpdatedAt: now() }
    })
  }, [])

  /** Back to the shipped protocol. Day logs are untouched — history keyed by an
   *  id the seed still uses simply lines up again.
   *
   *  IT DEDUPES ON THE WAY IN, and that is not the ongoing duplicate check the
   *  spec rules out. The seed still carries the AM/PM pairs on purpose (its ids
   *  are the frozen storage contract), so every path that INTRODUCES the seed
   *  has to fold them the same way — otherwise "Reset routine" is a button that
   *  quietly reinstates the exact workaround the migration just removed. */
  const resetRoutine = useCallback(() => {
    setState(s => ({ ...s, routine: dedupeLibrary(defaultRoutine()).routine, routineUpdatedAt: now() }))
  }, [])

  /* ── Settings & profile ──────────────────────────────────────────────────*/

  const setSettings = useCallback(patch => {
    setState(s => ({ ...s, settings: { ...s.settings, ...patch }, settingsUpdatedAt: now() }))
  }, [])

  const setProfile = useCallback(patch => {
    setState(s => ({ ...s, profile: { ...s.profile, ...patch }, profileUpdatedAt: now() }))
  }, [])

  /** Erase everything, including the routine — this is the "hand the phone on"
   *  button, so it has to leave a genuinely fresh install, not a blank history
   *  under someone else's checklist. */
  const resetAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setState({ ...EMPTY, routine: defaultRoutine() })
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

  /**
   * Accepts either a STACK backup blob or a bare legacy `{key: {taskId:true}}`
   * dump. Day logs MERGE rather than replace — importing twice is harmless.
   *
   * A routine can't merge that way: two edited routines have no meaningful
   * union, and half-applying one would produce a checklist neither device ever
   * had. So it follows the same last-write-wins rule as settings and profile —
   * newest `routineUpdatedAt` wins — and the caller is told whether the routine
   * came across, because that is a much bigger change than a few extra days.
   */
  const importBackup = useCallback(raw => {
    let parsed
    try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw }
    catch { throw new Error('That is not valid JSON.') }

    let incoming
    let routine = null
    let routineAt = null

    if (parsed?.format === 'stack-backup' && parsed.state) {
      incoming = parsed.state.items || []
      routine = parsed.state.routine || null
      routineAt = parsed.state.routineUpdatedAt || null
    } else if (Array.isArray(parsed?.items)) {
      incoming = parsed.items
      routine = parsed.routine || null
      routineAt = parsed.routineUpdatedAt || null
    } else if (parsed && typeof parsed === 'object') {
      incoming = normaliseLegacyDump(parsed)
    } else {
      throw new Error('Unrecognised backup format.')
    }
    if (!incoming.length) throw new Error('No day records found in that file.')

    // Decided out here, not inside the updater: the updater runs after this
    // function has already returned (and twice under StrictMode), so a flag set
    // in there would always read back false — and would double-report if it
    // didn't.
    const takeRoutine = !!routine && (routineAt || '') > (state.routineUpdatedAt || '')

    setState(s => {
      const next = { ...s, items: mergeDayLogs(s.items, incoming) }
      if (takeRoutine) {
        next.routine = normaliseRoutine(routine, s.routine)
        next.routineUpdatedAt = routineAt
      }
      return next
    })
    return { days: incoming.length, routine: takeRoutine }
  }, [state.routineUpdatedAt])

  /* ── Google Drive sync ───────────────────────────────────────────────────
     The slot this file always had one comment about — "only the transport is
     missing" — filled in. `mergeStates` needed no changes: day logs union by
     date key with newest-edit-wins, the routine resolves last-write-wins, and
     tombstones survive. That was the whole point of storing day logs as the
     template's `items` array in the first place.

     MERGE, NOT LAST-WRITE-WINS, for the file as a whole. A phone that has been
     offline for a week can add the days it logged, but it can never wipe out
     days it has never heard of. Plant Tracker learned this the same way.      */

  const connectGoogle = useCallback(() => signIn(), [])

  const disconnectGoogle = useCallback(() => {
    clearToken()
    // The sync file is deliberately NOT deleted: disconnecting is "stop talking
    // to Drive on this device", not "throw away the backup".
    setSync(s => ({ ...s, connected: false, error: null, folder: null }))
  }, [])

  const syncNow = useCallback(async () => {
    if (!isAuthenticated()) { setSync(s => ({ ...s, connected: false })); return }
    if (syncBusy.current) return
    syncBusy.current = true
    setSync(s => ({ ...s, connected: true, busy: true, error: null }))

    try {
      const folder = await resolveFolder()
      const meta = loadSyncMeta()
      let fileId = meta.fileId || (await findSyncFile())?.id || null

      if (fileId) {
        // A missing or unreadable file is treated as "no file" rather than an
        // error: the usual cause is that it was deleted from Drive by hand, and
        // the right response is to write a fresh one, not to keep failing.
        const remote = await downloadSyncFile(fileId).catch(() => null)

        if (remote?.state) {
          const merged = mergeStates(latest.current, remote.state)

          applying.current += 1
          setState(merged)

          // Push back only when this device actually contributed something the
          // remote lacks. Without this check every open of the app rewrites the
          // file, and `modifiedTime` stops meaning anything.
          const remoteDays = new Set((remote.state.items || []).map(i => i.id))
          const contributed =
            dirty.current ||
            merged.items.length !== (remote.state.items || []).length ||
            merged.items.some(i => !remoteDays.has(i.id)) ||
            (merged.routineUpdatedAt || '') > (remote.state.routineUpdatedAt || '')

          if (contributed) {
            const payload = { savedAt: now(), version: APP_VERSION, state: merged }
            await updateSyncFile(fileId, JSON.stringify(payload))
            dirty.current = false
            saveSyncMeta({ fileId, savedAt: payload.savedAt, lastSyncedAt: Date.now() })
          } else {
            dirty.current = false
            saveSyncMeta({ fileId, savedAt: remote.savedAt || null, lastSyncedAt: Date.now() })
          }
        } else {
          const payload = { savedAt: now(), version: APP_VERSION, state: latest.current }
          await updateSyncFile(fileId, JSON.stringify(payload))
          dirty.current = false
          saveSyncMeta({ fileId, savedAt: payload.savedAt, lastSyncedAt: Date.now() })
        }
      } else {
        // First sync for this account: seed the file from what is on the device.
        const payload = { savedAt: now(), version: APP_VERSION, state: latest.current }
        fileId = await createSyncFile(JSON.stringify(payload))
        dirty.current = false
        saveSyncMeta({ fileId, savedAt: payload.savedAt, lastSyncedAt: Date.now() })
      }

      setSync({
        configured: isConfigured(), connected: true, busy: false,
        error: null, lastSyncedAt: Date.now(), folder,
      })
    } catch (e) {
      const expired = e instanceof AuthExpiredError
      setSync(s => ({
        ...s,
        busy: false,
        connected: !expired,
        error: expired ? 'Google session expired — reconnect below.' : e.message,
      }))
    } finally {
      syncBusy.current = false
    }
  }, [])
  syncNowRef.current = syncNow

  /* Mark local edits dirty and schedule a debounced push. 4s matches Plant
     Tracker: long enough that ticking off a morning routine is one upload
     rather than eight, short enough to survive closing the app. */
  useEffect(() => {
    if (dirtyFirstRun.current) { dirtyFirstRun.current = false; return }
    if (applying.current > 0) { applying.current -= 1; return }
    dirty.current = true
    if (!isAuthenticated()) return
    clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => syncNowRef.current(), 4000)
    return () => clearTimeout(syncTimer.current)
  }, [state])

  /* Pull once on startup when already connected, and again whenever the app
     comes back to the foreground — the phone is the second device here, and it
     is usually the one that has been asleep. */
  useEffect(() => {
    if (!isAuthenticated()) return
    syncNowRef.current()
    const onVisible = () => { if (document.visibilityState === 'visible') syncNowRef.current() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  /* Called by the OAuth callback route once a token has been stored. */
  const refreshSync = useCallback(() => {
    setSync(s => ({ ...s, connected: isAuthenticated() }))
    syncNowRef.current()
  }, [])

  const value = useMemo(() => ({
    state, sync, routine: state.routine,
    getDay, toggleTask, ensureDay, resetDay,
    setRoutine, resetRoutine,
    setSettings, setProfile, resetAll,
    exportBackup, importBackup,
    connectGoogle, disconnectGoogle, syncNow, refreshSync, folderUrl,
  }), [state, sync, getDay, toggleTask, ensureDay, resetDay,
       setRoutine, resetRoutine,
       setSettings, setProfile, resetAll, exportBackup, importBackup,
       connectGoogle, disconnectGoogle, syncNow, refreshSync])

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
  // The routine is a single document, not a set: there is no union of two
  // edited checklists that either device would recognise, so it resolves by
  // last edit like the other single-document fields. `>=` keeps local on a tie,
  // which matters because a tie means the same edit arrived back from sync.
  const routineLocal  = !!local.routineUpdatedAt  && local.routineUpdatedAt  >= (remote.routineUpdatedAt  || '')

  return {
    ...remote, ...local,
    items,
    deleted,
    settings:          settingsLocal ? local.settings          : remote.settings,
    settingsUpdatedAt: settingsLocal ? local.settingsUpdatedAt : remote.settingsUpdatedAt,
    profile:           profileLocal  ? local.profile           : remote.profile,
    profileUpdatedAt:  profileLocal  ? local.profileUpdatedAt  : remote.profileUpdatedAt,
    routine:           routineLocal  ? local.routine           : (remote.routine || local.routine),
    routineUpdatedAt:  routineLocal  ? local.routineUpdatedAt  : remote.routineUpdatedAt,
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

/**
 * Read state, and guarantee a usable routine on the way out.
 *
 * The seed happens HERE rather than in an effect, so the very first render
 * already has a routine to build a checklist from. An effect would have to
 * render one frame of "no protocol" first, and every consumer would need a
 * null branch that exists for a single frame and is therefore never tested.
 *
 * A device that upgrades into this version has saved state with no `routine`
 * key at all: it falls through to the seed, which reproduces the protocol it
 * was already showing — same task ids, same days — so nothing about the
 * upgrade is visible, and its history keeps lining up.
 */
function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    // No blob at all = a genuinely fresh install: the only case that gets the
    // first-run flow. Anything with saved state keeps onboardingDone true.
    if (!raw) {
      return {
        ...EMPTY,
        settings: { ...EMPTY.settings, onboardingDone: false },
        routine: defaultRoutine(),
      }
    }
    // spread over EMPTY so a schema addition never lands as undefined
    const saved = JSON.parse(raw)
    return {
      ...EMPTY,
      ...saved,
      settings: { ...EMPTY.settings, ...saved.settings },
      // Normalised on every load, not only on import: this blob is editable by
      // hand in devtools and survives across versions, and every reader below
      // assumes the shape is sound.
      routine: normaliseRoutine(saved.routine, defaultRoutine()),
    }
  } catch {
    return { ...EMPTY, routine: defaultRoutine() }
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
