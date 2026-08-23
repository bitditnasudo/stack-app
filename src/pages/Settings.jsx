/* ============================================================================
   SETTINGS — notifications, backup, and the build stamp.
   ============================================================================
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
  Bell, BellOff, Download, Upload, Trash2, Clock, SlidersHorizontal, ChevronRight, CalendarPlus,
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

      {/* ── You ───────────────────────────────────────────────────────────────
          Everything the first-run flow asked for, in one place, so a device
          that skipped onboarding — or one that upgraded straight past it and
          was never asked — has somewhere to answer.

          THE WAKE/SLEEP PAIR IS WHAT THE HOME BAR MEASURES AGAINST. Until both
          are set, `dayProgress` returns null and the dashboard shows the ring
          alone rather than a bar sitting at a default nobody chose. */}
      <SectionHead title="You" />
      <Card>
        <Field label="Name" hint="Used for the greeting on Home. Nothing else reads it.">
          <input
            value={state.profile?.name || ''}
            placeholder="Your name"
            maxLength={40}
            onChange={e => setProfile({ name: e.target.value.slice(0, 40) })}
          />
        </Field>
        <div className="field-row">
          <Field label="I wake up at">
            <input type="time" value={state.settings.wakeTime || ''}
                   onChange={e => setSettings({ wakeTime: e.target.value })} />
          </Field>
          <Field label="I go to bed at">
            <input type="time" value={state.settings.sleepTime || ''}
                   onChange={e => setSettings({ sleepTime: e.target.value })} />
          </Field>
        </div>
        <p className="prose muted" style={{ fontSize: 'var(--fs-xs)', marginBottom: 0 }}>
          {state.settings.wakeTime && state.settings.sleepTime
            ? 'Home shows how much of your waking day has gone beside how much of your stack is done.'
            : 'Set both to see the “day elapsed” bar on Home. A bedtime after midnight is fine.'}
        </p>
      </Card>

      {/* ── Routine ───────────────────────────────────────────────────────────
          Above reminders, because reminders are DERIVED from it: this is the
          control that changes the rest of this page. */}
      <SectionHead title="Protocol" />
      <Card>
        <button className="list-row nav-row" onClick={() => navigate('/routine')}>
          <span className="row-icon"><SlidersHorizontal size={16} /></span>
          <span className="grow">
            <b>Edit routine</b>
            <small>
              {routine.habits.length} habit{routine.habits.length === 1 ? '' : 's'} ·{' '}
              {routine.templates.length} day{routine.templates.length === 1 ? '' : 's'} ·{' '}
              {routine.categories.length} categories
            </small>
          </span>
          <ChevronRight size={18} />
        </button>
        {/* The guided builder is re-runnable, not a one-shot part of first run.
            It is the right surface whenever the week is being rebuilt rather
            than adjusted — the editor is for "change this one thing", this is
            for "start again from Monday". */}
        <button className="list-row nav-row" onClick={() => navigate('/build?day=1')}>
          <span className="row-icon"><CalendarPlus size={16} /></span>
          <span className="grow">
            <b>Build the week step by step</b>
            <small>One day at a time, from Monday — the guided version.</small>
          </span>
          <ChevronRight size={18} />
        </button>
      </Card>

      {/* ── Notifications ─────────────────────────────────────────────────── */}
      <SectionHead title="Reminders" />
      <Card>
        <div className="row row-tight">
          <span className={`row-icon${perm === 'denied' ? ' row-icon-danger' : ''}`}>
            {perm === 'granted' ? <Bell size={16} /> : <BellOff size={16} />}
          </span>
          <div className="grow">
            <b>Protocol reminders</b>
            <div className="muted">
              {!supportsNotifications() ? 'This browser does not support notifications.'
                : perm === 'granted' ? `${armed.length} armed for the rest of today.`
                : perm === 'denied'  ? 'Blocked. Re-allow in your browser’s site settings.'
                : 'Off — a nudge before the habits you set a time on.'}
            </div>
          </div>
          {perm === 'granted'
            ? <Tag tone="ok">On</Tag>
            : <Tag tone={perm === 'denied' ? 'danger' : 'neutral'}>Off</Tag>}
        </div>

        {supportsNotifications() && perm === 'default' && (
          <Button block onClick={onEnable}>Enable reminders</Button>
        )}

        {/* Stated plainly, because the original implied a reliability it never
            had. Timers live in the page; a closed app fires nothing. */}
        <p className="prose muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--sp-3)' }}>
          Reminders are scheduled inside the app, so they only fire while STACK is
          open or backgrounded. If the phone closes it, that day&rsquo;s remaining
          reminders are lost until you open it again.
        </p>
      </Card>

      <Card>
        {schedule.length === 0 ? (
          <div className="muted">
            No reminders yet — give a habit a time and a reminder under
            <b>Edit routine</b> and it will show up here.
          </div>
        ) : schedule.map(n => (
          <div className="list-row" key={n.id}>
            <div className="grow">
              {n.title}
              <small>{n.body}</small>
            </div>
            <Tag tone="neutral"><Clock />{formatFireTime(n)}</Tag>
          </div>
        ))}
      </Card>

      {/* ── Google Drive ──────────────────────────────────────────────────────
          Above the manual export, because it supersedes it as the everyday
          answer to "where is my data". The file export stays as the offline
          escape hatch and as the bridge for the old GitHub Pages history. */}
      <SectionHead title="Backup" />
      <Card>
        <div className="row row-tight">
          <span className={`row-icon${sync.connected ? '' : ' row-icon-danger'}`}>
            {sync.connected ? <Cloud size={16} /> : <CloudOff size={16} />}
          </span>
          <div className="grow">
            <b>Google Drive</b>
            <div className="muted">
              {!sync.configured
                ? 'Not configured — VITE_GOOGLE_CLIENT_ID is missing from this build.'
                : sync.connected
                  ? `Your routine and every logged day sync as one JSON file.${
                      sync.lastSyncedAt ? ` Last sync ${new Date(sync.lastSyncedAt).toLocaleTimeString()}.` : ''}`
                  : sync.lastSyncedAt
                    ? `Session expired — reconnect to resume. Your data is safe on this device. Last sync ${new Date(sync.lastSyncedAt).toLocaleTimeString()}.`
                    : 'Off — your data lives only on this device.'}
            </div>
          </div>
          {sync.connected
            ? <Tag tone="ok">On</Tag>
            : <Tag tone="neutral">Off</Tag>}
        </div>

        {sync.configured && (sync.connected ? (
          <>
            <Button variant="secondary" block disabled={sync.busy} onClick={syncNow}>
              {sync.busy ? <Spinner size={14} /> : <RefreshCw size={14} />}
              {sync.busy ? 'Syncing…' : 'Sync now'}
            </Button>
            <Button variant="plain" block onClick={disconnectGoogle} style={{ marginTop: 'var(--sp-2)' }}>
              Disconnect
            </Button>
          </>
        ) : (
          <Button block onClick={connectGoogle}>
            <Cloud size={14} />
            {sync.lastSyncedAt ? 'Reconnect Google Drive' : 'Connect Google Drive'}
          </Button>
        ))}

        {/* Which folder it is ACTUALLY writing to. `pinned: false` means the
            configured folder could not be reached and the app made its own —
            silently writing somewhere other than where you pointed it would be
            worse than failing, so it says so and links to the real one. */}
        {sync.folder && (
          <div className="row row-tight" style={{ marginTop: 'var(--sp-3)' }}>
            <div className="grow">
              <a className="link-row" href={folderUrl(sync.folder.id)} target="_blank" rel="noreferrer">
                {sync.folder.name} <ExternalLink size={13} />
              </a>
              {!sync.folder.pinned && (
                <div className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--sp-1)' }}>
                  <AlertTriangle size={12} /> This is a folder STACK created. The
                  configured folder could not be opened with the permission this
                  app asks for &mdash; see CLAUDE.md &rarr; Drive sync.
                </div>
              )}
            </div>
          </div>
        )}

        {sync.error && (
          <p className="prose" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger-ink)', marginTop: 'var(--sp-3)' }}>
            {sync.error}
          </p>
        )}

        <p className="prose muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--sp-3)' }}>
          Devices <b>merge</b> rather than overwrite: a phone that has been
          offline can add the days it logged, but it can never delete days it
          never saw. The routine itself is a single document, so the most recent
          edit to it wins.
        </p>
      </Card>

      {/* ── Data ──────────────────────────────────────────────────────────── */}
      <SectionHead title="Data" sub={`${dayCount} day${dayCount === 1 ? '' : 's'} logged`} />
      <Card>
        <div className="row row-tight">
          <span className="row-icon"><Download size={16} /></span>
          <div className="grow">
            <b>Export backup</b>
            <div className="muted">A JSON file of every logged day.</div>
          </div>
        </div>
        <Button variant="secondary" block onClick={onExport}>Download backup</Button>

        <div className="row row-tight" style={{ marginTop: 'var(--sp-4)' }}>
          <span className="row-icon"><Upload size={16} /></span>
          <div className="grow">
            <b>Import</b>
            <div className="muted">Merges by date — importing twice is harmless.</div>
          </div>
        </div>
        <Button variant="secondary" block onClick={() => { setImporting(true); setError(null) }}>
          Restore from backup
        </Button>
      </Card>

      <Card variant="danger">
        <div className="row row-tight">
          <span className="row-icon row-icon-danger"><Trash2 size={16} /></span>
          <div className="grow">
            <b>Erase everything</b>
            <div className="muted">Deletes all logged days on this device.</div>
          </div>
        </div>
        <Button
          variant="danger" block
          onClick={() => {
            if (confirm('Erase all STACK data on this device? Export a backup first.')) {
              resetAll()
              setToast('All data erased.')
            }
          }}
        >
          Erase all data
        </Button>
      </Card>

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
