/* ============================================================================
   UI KIT — one component per pattern in index.css.
   ============================================================================
   Rule of the house: if a screen needs a visual that isn't here, add it here
   (with its CSS in index.css) rather than inlining a style. Both source apps
   drifted because "just this once" inline styles were never promoted.
   ========================================================================== */

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

/* ── Surfaces ────────────────────────────────────────────────────────────── */

/** variant: 'default' | 'hero' | 'ok' | 'warn' | 'danger' | 'brand' */
export function Card({ variant = 'default', className = '', children, ...rest }) {
  const v = variant === 'default' ? '' : ` card-${variant}`
  return <div className={`card${v} ${className}`.trim()} {...rest}>{children}</div>
}

/** Micro-label above a group inside a card. */
export function SectionTitle({ children }) {
  return <div className="section-title">{children}</div>
}

/** Heading with an optional counter / action on the right. */
export function SectionHead({ title, sub, action }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      <div className="section-head-aside">
        {sub && <span className="sub">{sub}</span>}
        {action}
      </div>
    </div>
  )
}

/* ── Controls ────────────────────────────────────────────────────────────── */

/** variant: 'primary' | 'secondary' | 'soft' | 'danger' | 'plain' */
export function Button({ variant = 'primary', block, size, className = '', children, ...rest }) {
  const cls = [
    'btn', `btn-${variant}`,
    block && 'btn-block',
    size === 'sm' && 'btn-sm',
    className,
  ].filter(Boolean).join(' ')
  return <button className={cls} {...rest}>{children}</button>
}

/** tone: 'ok' | 'warn' | 'danger' | 'info' | 'brand' | 'neutral' | 'outline' | 'on-dark' */
export function Tag({ tone = 'neutral', children }) {
  return <span className={`tag tag-${tone}`}>{children}</span>
}

export function Chip({ active, children, ...rest }) {
  return <button className={`chip${active ? ' is-active' : ''}`} {...rest}>{children}</button>
}

/** options: [{ value, label }] — two to four mutually exclusive choices. */
export function Segmented({ options, value, onChange }) {
  return (
    <div className="seg" role="tablist">
      {options.map(o => (
        <button
          key={o.value} role="tab" aria-selected={o.value === value}
          className={o.value === value ? 'is-active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Labelled form control. Pass an <input>/<select>/<textarea> as children. */
export function Field({ label, hint, error, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && !error && <div className="hint">{hint}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  )
}

/* ── Overlays ────────────────────────────────────────────────────────────── */

/**
 * Bottom sheet on phones, centred card from 700px up.
 * Closes on backdrop click and on Escape, and restores focus to whatever
 * opened it — both source apps had sheets that trapped keyboard users.
 */
export function Sheet({ title, onClose, children, footer, split }) {
  const opener = useRef(typeof document !== 'undefined' ? document.activeElement : null)
  const panel = useRef(null)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    // stop the page behind the sheet from scrolling
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      opener.current?.focus?.()
    }
  }, [onClose])

  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div
        ref={panel} tabIndex={-1}
        className={`sheet${split ? ' sheet-split' : ''}`}
        role="dialog" aria-modal="true" aria-label={title}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        {title && (
          <div className="row sheet-title">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
        )}
        {children}
        {footer}
      </div>
    </div>
  )
}

/**
 * Popover anchored under its trigger, with a tail. Dismisses on outside
 * pointerdown or Escape. Wrap trigger + popover in the returned element.
 */
export function Popover({ open, onClose, trigger, children, label }) {
  const wrap = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = e => { if (wrap.current && !wrap.current.contains(e.target)) onClose?.() }
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <div className="popover-wrap" ref={wrap}>
      {trigger}
      {open && <div className="popover" role="dialog" aria-label={label}>{children}</div>}
    </div>
  )
}

/* ── Feedback ────────────────────────────────────────────────────────────── */

export function Toast({ message, tone = 'default', onDone, duration = 3000 }) {
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), duration)
    return () => clearTimeout(t)
  }, [onDone, duration])
  return (
    <div className={`toast${tone === 'danger' ? ' toast-danger' : ''}`} role="status" aria-live="polite">
      {message}
    </div>
  )
}

export function Spinner({ size = 18 }) {
  return <div className="spinner" style={{ width: size, height: size }} role="status" aria-label="Loading" />
}

/** A real empty state: illustration, what's missing, and the way out of it. */
export function Empty({ icon, title, children, action }) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function Progress({ value, max = 100, tone }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100))
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`progress-fill${tone ? ` progress-fill-${tone}` : ''}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Onboarding / wizard step indicator. */
export function Steps({ count, current }) {
  return (
    <div className="steps">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`step-dot${i <= current ? ' is-active' : ''}`} />
      ))}
    </div>
  )
}

/* ============================================================================
   STACK ADDITIONS — promote to the shared template when a second app needs one.
   ============================================================================
   Added here rather than inlined, per the kit's house rule. Every value comes
   from theme.css; nothing below hardcodes a colour, size, radius or shadow, so
   the theme swap still re-skins them.

   Audited 2026-08-12 against the kit and against the other apps in the family.
   Everything below stays here, for a stated reason:

   · <TaskRow>  — structurally unlike .list-row (a leading toggle, a stacked
                  body, a wrapping meta row). Domain, not drift.
   · <Ring>     — a single-value progress meter. Budget's CategoryRing is a
                  multi-arc distribution donut with SVG text and runtime colours;
                  it would not consume this, and no third app draws an arc at
                  all. Promoting it would put a class in the kit that exactly one
                  app exercises.
   · <Heatmap>  — a seven-day completion strip. STACK is the only habit tracker
                  in the family; nothing else has a use for it yet.

   A <MetaPill> used to live here. It was .tag with a border and one font-weight
   step, so it was deleted and its call sites moved to <Tag> — see the tag block
   in index.css.
   ========================================================================== */

/**
 * One checklist line. The whole row is the hit target — the ring alone is far
 * under 44px, and the original app's row-level onclick is the behaviour that
 * makes this usable one-handed at 6:30am.
 *
 * Rendered as a real <button> so it is keyboard-reachable and announces its
 * pressed state; the original was a <div> with an onclick and neither.
 */
export function TaskRow({ done, name, detail, children, onToggle }) {
  return (
    <button
      type="button"
      className={`task-row${done ? ' is-done' : ''}`}
      aria-pressed={done}
      onClick={onToggle}
    >
      <span className="task-ring" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="task-body">
        <span className="task-name">{name}</span>
        {detail && <span className="task-detail">{detail}</span>}
        {children && <span className="task-meta">{children}</span>}
      </span>
    </button>
  )
}

/**
 * Completion ring. Sized in CSS, drawn on a fixed 100-unit viewBox and scaled —
 * safe here (unlike a chart) because a circle has no text inside it to magnify.
 */
export function Ring({ pct, label, sub }) {
  const R = 42
  const C = 2 * Math.PI * R
  const safe = Math.max(0, Math.min(100, pct || 0))
  return (
    <div className="ring" role="img" aria-label={`${Math.round(safe)} percent complete`}>
      <svg viewBox="0 0 100 100">
        <circle className="ring-track" cx="50" cy="50" r={R} />
        <circle
          className={`ring-value${safe >= 100 ? ' is-complete' : ''}`}
          cx="50" cy="50" r={R}
          strokeDasharray={C}
          strokeDashoffset={C - (C * safe) / 100}
        />
      </svg>
      <div className="ring-center">
        <b>{label}</b>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  )
}

/**
 * Seven-day completion strip.
 *
 * `days`: [{ key, label, pct, isToday, isFuture, title }]
 *   pct === null → no data recorded (distinct from 0%, which means "opened,
 *   ticked nothing"). The original conflated the two and every untouched day
 *   read as a failure.
 */
export function Heatmap({ days }) {
  return (
    <div className="heatmap">
      {days.map(d => (
        <div className="heat-cell" key={d.key}>
          <div className={`heat-label${d.isToday ? ' is-today' : ''}`}>{d.label}</div>
          <div
            className={`heat-dot ${heatLevel(d)}${d.isToday ? ' is-today' : ''}`}
            title={d.title}
          >
            {d.isFuture ? '' : d.pct === null ? '–' : d.pct === 100 ? '✓' : d.pct}
          </div>
          <div className="heat-pct">
            {d.isFuture || d.pct === null ? '' : `${d.pct}%`}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Six buckets, so a glance reads as a gradient rather than a binary. */
function heatLevel(d) {
  if (d.isFuture)      return 'heat-future'
  if (d.pct === null)  return 'heat-none'
  if (d.pct >= 100)    return 'heat-perfect'
  if (d.pct >= 80)     return 'heat-5'
  if (d.pct >= 60)     return 'heat-4'
  if (d.pct >= 40)     return 'heat-3'
  if (d.pct >= 15)     return 'heat-2'
  if (d.pct > 0)       return 'heat-1'
  return 'heat-none'
}
