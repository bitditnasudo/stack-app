/* ============================================================================
   SETTINGS — you, reminders, backup, and the build stamp.
   ============================================================================
   Trimmed to one card per job. Reminders were two cards (status + schedule)
   with a paragraph of caveats; Backup was a Drive card, an Export/Import card
   with a row of explanation per button, and an Erase card. The "build the week
   step by step" row is gone — the guided builder is part of first run, and
   the editor does everything it does.

   The old app's "Notify" tab lived here in everything but name: a permission
   button and a read-only schedule. Folded in, which keeps the nav at four tabs.

   Backup is not a nice-to-have in this app. localStorage is scoped to an
   origin, and this app changed origin when it moved off GitHub Pages, so
   export/import is the only bridge that history has. It stays useful afterwards
   as the only backup that exists.
   ========================================================================== */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, BellOff, Download, Upload, Trash2, Clock, SlidersHorizontal, ChevronRight,
  Cloud, CloudOff, RefreshCw, ExternalLink, AlertTriangle,
} from 'lucide-react'
import { PageHeader } from '../components/AppShell.jsx'
import { Card, SectionHead, Button, Tag, Field, Sheet, Toast, Spinner } from '../components/UI.jsx'
import { Signature } from '../components/Signature.jsx'
import { useStore } from '../lib/store.jsx'
import {
  supportsNotifications, notificationPermission, requestPermission,
  scheduleToday, formatFireTime,
} from '../lib/notifications.js'
import { notifScheduleFor } from '../lib/routine.js'
import { VERSION_LABEL, BUILD_COMMIT, BUILD_DATE, COMMIT_COUNT } from '../app.config.jsx'

/** Days always merge; the routine only crosses over if the backup's is newer.
 *  Say which happened — replacing the checklist is a far bigger change than
 *  gaining a few days of history, and it should never be a silent one. */
function importSummary({ days, routine }) {
  const d = `Imported ${days} day${days === 1 ? '' : 's'}`
  return routine ? `${d}, and the routine from that backup.` : `${d}.`
}

export default function Settings() {
  const navigate = useNavigate()
  const {
    state, routine, exportBackup, importBackup, resetAll,
    setSettings, setProfile, storageOk,
    sync, connectGoogle, disconnectGoogle, syncNow, folderUrl,
  } = useStore()
  const [perm, setPerm] = useState(() => notificationPermission())
  const [armed, setArmed] = useState([])
  const [importing, setImporting] = useState(false)
  const [paste, setPaste] = useState('')
  const [toast, setToast] = useState(null)
  const [error, setError] = useState(null)

  /* Derived from the habits' own times. There is no hand-kept reminder list any
     more — that is what stopped the old build announcing a stale checklist —
     and habits sharing a fire time merge into a single notification. */
  const schedule = useMemo(() => notifScheduleFor(routine), [routine])

  // Re-arm on mount, whenever the tab comes back, AND whenever the schedule
  // changes: a phone that slept through a fire time has dropped its timer and
  // only a focus event tells us, while editing a habit's time invalidates every
  // timer already armed.
  useEffect(() => {
    const sync = () => { setPerm(notificationPermission()); setArmed(scheduleToday(schedule)) }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [schedule])

  const onEnable = async () => {
    const p = await requestPermission(schedule)
    setPerm(p)
    setArmed(scheduleToday(schedule))
  }

  const onExport = () => {
    const blob = new Blob([exportBackup()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stack-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setToast('Backup downloaded.')
  }

  const onImportFile = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setToast(importSummary(importBackup(await file.text())))
      setImporting(false)
      setError(null)
    } catch (err) { setError(err.message) }
    e.target.value = ''
  }

  const onImportPaste = () => {
    try {
      setToast(importSummary(importBackup(paste)))
      setPaste('')
      setImporting(false)
      setError(null)
    } catch (err) { setError(err.message) }
  }

  const dayCount = state.items.length

  return (
    <div className="main-content">
      <PageHeader title="Settings" />

      {/* THE LOUDEST THING ON THE PAGE WHEN IT IS TRUE, because the symptom is
          otherwise indistinguishable from "the app forgot everything": nothing
          persists, so the next launch reads no saved blob and opens the
          first-run flow again. It used to fail silently — `saveLocal` caught
          the exception and moved on. */}
      {!storageOk && (
        <Card variant="danger">
          <div className="row row-tight">
            <span className="row-icon"><AlertTriangle size={16} /></span>
            <div className="grow">
              <b>This device isn&rsquo;t saving your data</b>
              <div className="muted">
                Everything you change is working, but only in memory — it will be
                gone when you close STACK, and the first-run tour will open
                again. Private browsing blocks storage; so does a full disk.
                Connect Google Drive below, or open STACK in a normal tab.
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ── You ─────────────────────────────────────────────────────────────
          Wake and sleep drive the "% of your day gone" line on Today; until both
          are set that line is absent rather than measured against a default. */}
      <SectionHead title="You" />
      <Card>
        <Field label="Name">
          <input
            value={state.profile?.name || ''}
            placeholder="Your name"
            maxLength={40}
            onChange={e => setProfile({ name: e.target.value.slice(0, 40) })}
          />
        </Field>
        <div className="field-row">
          <Field label="Wake up">
            <input type="time" value={state.settings.wakeTime || ''}
                   onChange={e => setSettings({ wakeTime: e.target.value })} />
          </Field>
          <Field label="Bedtime">
            <input type="time" value={state.settings.sleepTime || ''}
                   onChange={e => setSettings({ sleepTime: e.target.value })} />
          </Field>
        </div>
        <button className="list-row nav-row" onClick={() => navigate('/routine')}>
          <span className="row-icon"><SlidersHorizontal size={16} /></span>
          <span className="grow">
            <b>Edit routine</b>
            <small>
              {routine.habits.length} habit{routine.habits.length === 1 ? '' : 's'} ·{' '}
              {routine.templates.length} routine{routine.templates.length === 1 ? '' : 's'}
            </small>
          </span>
          <ChevronRight size={18} />
        </button>
      </Card>

      {/* ── Reminders — one card: status, the switch, and what will fire. ── */}
      <SectionHead title="Reminders" sub={perm === 'granted' ? `${armed.length} left today` : undefined} />
      <Card>
        <div className="row row-tight">
          <span className={`row-icon${perm === 'denied' ? ' row-icon-danger' : ''}`}>
            {perm === 'granted' ? <Bell size={16} /> : <BellOff size={16} />}
          </span>
          <div className="grow muted">
            {!supportsNotifications() ? 'Not supported in this browser.'
              : perm === 'granted' ? 'On. Only fires while STACK is open or in the background.'
              : perm === 'denied'  ? 'Blocked — re-allow in your browser’s site settings.'
              : 'Off.'}
          </div>
          {supportsNotifications() && perm === 'default' && (
            <Button size="sm" onClick={onEnable}>Enable</Button>
          )}
        </div>
        {schedule.length === 0 ? (
          <div className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--sp-2)' }}>
            Give a habit a time and a reminder and it shows up here.
          </div>
        ) : schedule.map(n => (
          <div className="list-row" key={n.id}>
            {/* The body (the names, in order) only. The title is the
                notification's own headline — "Creatine soon" — and printed
                above the body it just said the same name twice. */}
            <div className="grow">{n.body}</div>
            <Tag tone="neutral"><Clock />{formatFireTime(n)}</Tag>
          </div>
        ))}
      </Card>

      {/* ── Backup — Drive first, the file export as the offline escape hatch. */}
      <SectionHead title="Backup" sub={`${dayCount} day${dayCount === 1 ? '' : 's'} logged`} />
      <Card>
        <div className="row row-tight">
          <span className={`row-icon${sync.connected ? '' : ' row-icon-danger'}`}>
            {sync.connected ? <Cloud size={16} /> : <CloudOff size={16} />}
          </span>
          <div className="grow">
            <b>Google Drive</b>
            <div className="muted">
              {!sync.configured
                ? 'Not available in this build.'
                : sync.connected
                  ? (sync.lastSyncedAt ? `Synced ${new Date(sync.lastSyncedAt).toLocaleTimeString()}` : 'Connected')
                  : sync.lastSyncedAt
                    ? 'Session expired — reconnect. Your data is safe on this device.'
                    : 'Off — data lives only on this device.'}
            </div>
          </div>
          {sync.configured && sync.connected && (
            <button className="icon-btn" aria-label="Sync now" disabled={sync.busy} onClick={syncNow}>
              {sync.busy ? <Spinner size={16} /> : <RefreshCw size={16} />}
            </button>
          )}
        </div>

        {sync.configured && !sync.connected && (
          <Button block onClick={connectGoogle}>
            <Cloud size={14} />
            {sync.lastSyncedAt ? 'Reconnect Google Drive' : 'Connect Google Drive'}
          </Button>
        )}

        {sync.error && (
          <p className="prose" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger-ink)', marginTop: 'var(--sp-2)' }}>
            {sync.error}
          </p>
        )}

        {sync.connected && (
          <div className="row row-tight" style={{ marginTop: 'var(--sp-2)' }}>
            {sync.folder && (
              <a className="link-row grow" href={folderUrl(sync.folder.id)} target="_blank" rel="noreferrer">
                {sync.folder.name} <ExternalLink size={13} />
              </a>
            )}
            <Button size="sm" variant="plain" onClick={disconnectGoogle}>Disconnect</Button>
          </div>
        )}

        <div className="field-row" style={{ marginTop: 'var(--sp-3)' }}>
          <Button variant="secondary" block onClick={onExport}><Download size={14} /> Export</Button>
          <Button variant="secondary" block onClick={() => { setImporting(true); setError(null) }}>
            <Upload size={14} /> Restore
          </Button>
        </div>
      </Card>

      <Button
        variant="danger" block
        onClick={() => {
          if (confirm('Erase all STACK data on this device — every logged day and your routine? Export a backup first.')) {
            resetAll()
            setToast('All data erased.')
          }
        }}
      >
        <Trash2 size={14} /> Erase all data on this device
      </Button>

      <Signature>
        {`v${VERSION_LABEL}`}
        {COMMIT_COUNT > 0 && ` · ${COMMIT_COUNT} commits`}
        {` · ${BUILD_COMMIT}`}
        {BUILD_DATE && ` · built ${new Date(BUILD_DATE).toLocaleDateString()}`}
      </Signature>

      {importing && (
        <Sheet title="Restore from backup" onClose={() => setImporting(false)}>
          <Field label="Backup file" error={error}>
            <input type="file" accept="application/json,.json" onChange={onImportFile} />
          </Field>
          <Field
            label="…or paste JSON"
            hint="Also accepts a raw dump from the old GitHub Pages build."
          >
            <textarea
              rows={6} value={paste} onChange={e => setPaste(e.target.value)}
              placeholder='{"2026-08-01": {"sk_am_spf": true}}'
            />
          </Field>
          <Button block disabled={!paste.trim()} onClick={onImportPaste}>Import</Button>
        </Sheet>
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
