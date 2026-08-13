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

import { useEffect, useState } from 'react'
import { Bell, BellOff, Download, Upload, Trash2, Clock } from 'lucide-react'
import { PageHeader } from '../components/AppShell.jsx'
import { Card, SectionHead, Button, Tag, Field, Sheet, Toast } from '../components/UI.jsx'
import { Signature } from '../components/Signature.jsx'
import { useStore } from '../lib/store.jsx'
import {
  supportsNotifications, notificationPermission, requestPermission,
  scheduleToday, formatFireTime,
} from '../lib/notifications.js'
import { NOTIF_SCHEDULE } from '../lib/protocol.js'
import { APP_VERSION, BUILD_COMMIT, BUILD_DATE, COMMIT_COUNT, DEPLOY_COUNT } from '../app.config.jsx'

export default function Settings() {
  const { state, exportBackup, importBackup, resetAll } = useStore()
  const [perm, setPerm] = useState(() => notificationPermission())
  const [armed, setArmed] = useState([])
  const [importing, setImporting] = useState(false)
  const [paste, setPaste] = useState('')
  const [toast, setToast] = useState(null)
  const [error, setError] = useState(null)

  // Re-arm on mount and whenever the tab comes back — a phone that slept through
  // a fire time has dropped the timer, and only a focus event tells us.
  useEffect(() => {
    const sync = () => { setPerm(notificationPermission()); setArmed(scheduleToday()) }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  const onEnable = async () => {
    const p = await requestPermission()
    setPerm(p)
    setArmed(scheduleToday())
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
      const n = importBackup(await file.text())
      setToast(`Imported ${n} day${n === 1 ? '' : 's'}.`)
      setImporting(false)
      setError(null)
    } catch (err) { setError(err.message) }
    e.target.value = ''
  }

  const onImportPaste = () => {
    try {
      const n = importBackup(paste)
      setToast(`Imported ${n} day${n === 1 ? '' : 's'}.`)
      setPaste('')
      setImporting(false)
      setError(null)
    } catch (err) { setError(err.message) }
  }

  const dayCount = state.items.length

  return (
    <div className="main-content">
      <PageHeader title="Settings" />

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
                : 'Off — a nudge 10 minutes before each block.'}
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
        {NOTIF_SCHEDULE.map(n => (
          <div className="list-row" key={n.id}>
            <div className="grow">
              {n.title}
              <small>{n.body}</small>
            </div>
            <Tag tone="neutral"><Clock />{formatFireTime(n)}</Tag>
          </div>
        ))}
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
        {`v${APP_VERSION}`}
        {DEPLOY_COUNT > 0 && ` · deploy #${DEPLOY_COUNT}`}
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
