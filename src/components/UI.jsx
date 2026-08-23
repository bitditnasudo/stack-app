/* ============================================================================
   UI KIT — one component per pattern in index.css.
   ============================================================================
   Rule of the house: if a screen needs a visual that isn't here, add it here
   (with its CSS in index.css) rather than inlining a style. Both source apps
   drifted because "just this once" inline styles were never promoted.
   ========================================================================== */

import { useEffect, useRef, useMemo } from 'react'
import { X, ChevronUp, ChevronDown, Trash2, Hourglass, Check, Clock, Sun, Moon } from 'lucide-react'
import { getContrastText } from '../lib/colorUtils.js'

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

   · <StepCard> — structurally unlike .list-row (a leading toggle, a stacked
                  body, a wrapping meta row, and a runtime fill colour). Domain,
                  not drift. Replaced <TaskRow> when a step gained a category
                  colour and the day became a sequence rather than a list.
   · <WaitCard> — a gap in that sequence. Nothing else in the family has one.
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

/* ============================================================================
   ROUTINE EDITOR ADDITIONS
   ============================================================================
   Added when the protocol became user-editable. These three are the whole
   vocabulary of that editor, and all three follow the same rule as the block
   above: no inline styles, every value a token, so a theme swap re-skins them.

   · <DayPicker>  — pick weekdays. Monday-first, like every other week in STACK.
   · <TonePicker> — pick a SEMANTIC tone, never a colour. The kit's swatch grid
                    is for literal colours (Budget's account colours); this
                    picks from --ok/--warn/--brand/…, which is what keeps a
                    user-named tag inside the design system.
   · <EditRow>    — a list row that opens an editor, with reorder and delete
                    beside it. Deliberately NOT a <button> wrapping buttons:
                    nested interactive elements are invalid HTML, and browsers
                    resolve the click ambiguity differently.
   ========================================================================== */

/** Monday-first weekday toggles. `value` is an array of JS day indices. */
export function DayPicker({ value = [], onChange, labelledBy }) {
  const toggle = d => onChange(value.includes(d) ? value.filter(x => x !== d) : [...value, d].sort())
  return (
    <div className="day-picker" role="group" aria-labelledby={labelledBy}>
      {DAY_PICK_ORDER.map(d => (
        <button
          key={d}
          type="button"
          className={`day-pick${value.includes(d) ? ' is-active' : ''}`}
          aria-pressed={value.includes(d)}
          /* The visible label is a single letter and three of them repeat
             (S,T,T,S), so the accessible name has to be the full day or a
             screen reader announces four ambiguous buttons. */
          aria-label={DAY_PICK_LABELS[d]}
          onClick={() => toggle(d)}
        >
          {DAY_PICK_SHORT[d]}
        </button>
      ))}
    </div>
  )
}

const DAY_PICK_ORDER  = [1, 2, 3, 4, 5, 6, 0]
const DAY_PICK_SHORT  = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_PICK_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Semantic tone picker — the tones are the kit's, so the names are too. */
export function TonePicker({ value, onChange, tones = ['brand', 'info', 'ok', 'warn', 'danger', 'neutral'] }) {
  return (
    <div className="tone-picker" role="group">
      {tones.map(t => (
        <button
          key={t}
          type="button"
          className={`tone-swatch tag-${t}${t === value ? ' is-selected' : ''}`}
          aria-pressed={t === value}
          aria-label={t}
          onClick={() => onChange(t)}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

/**
 * An editable list row: tap the body to edit, with reorder and delete alongside.
 *
 * `onUp`/`onDown` are omitted rather than disabled at the ends of a list — a
 * permanently dead control on the first row is noise, and the arrows are small
 * enough that "greyed out" and "unavailable" look identical at a glance.
 */
export function EditRow({ title, sub, meta, warn, onEdit, onUp, onDown, onDelete }) {
  return (
    <div className={`edit-row${warn ? ' is-warn' : ''}`}>
      <button type="button" className="edit-row-main" onClick={onEdit}>
        <span className="edit-row-title">{title}</span>
        {sub && <span className="edit-row-sub">{sub}</span>}
        {meta && <span className="edit-row-meta">{meta}</span>}
      </button>
      <div className="edit-row-actions">
        {onUp   && <button className="icon-btn icon-btn-sm" aria-label={`Move ${title} up`}   onClick={onUp}><ChevronUp size={16} /></button>}
        {onDown && <button className="icon-btn icon-btn-sm" aria-label={`Move ${title} down`} onClick={onDown}><ChevronDown size={16} /></button>}
        {onDelete && (
          <button className="icon-btn icon-btn-sm icon-btn-danger" aria-label={`Delete ${title}`} onClick={onDelete}>
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  )
}

/* ============================================================================
   STEP CARDS — the v2 checklist, in colour.
   ============================================================================
   A day is a SEQUENCE of steps, and a step is either a habit or a wait. Two
   components, because they are not the same kind of object: one is a thing you
   do and can tick, the other is time passing and cannot.

   THE COLOUR IS RUNTIME DATA, NOT A TOKEN. A category's colour is chosen by the
   user, so it cannot come from theme.css — the same exception the kit already
   makes for Budget's account colours. It is handed to CSS as a custom property
   rather than as an inline `background`, so every actual rule still lives in
   index.css and the house rule survives: `style` here only ever carries values,
   never declarations.

   `getContrastText` picks the ink, so a colour added to PALETTE later is
   readable without anyone re-measuring by hand.
   ========================================================================== */

/**
 * One habit in the day's sequence.
 *
 * Done steps DRAIN back to the plain surface rather than staying saturated:
 * with fifteen coloured cards the colour stops meaning anything, and this way
 * the remaining colour IS the remaining work — the list visibly empties as the
 * day goes. That was a deliberate choice over "colour everything always".
 *
 * A real <button> with aria-pressed, like the row it replaces: the original was
 * a <div onclick>, keyboard-unreachable and stateless to a screen reader.
 */
export function StepCard({ done, name, detail, time, duration, glyph, category, warn, onToggle }) {
  const fill = category?.color || '#888888'
  const Glyph = glyph
  return (
    <button
      type="button"
      className={`step-card${done ? ' is-done' : ''}`}
      aria-pressed={done}
      onClick={onToggle}
      style={{ '--step-fill': fill, '--step-ink': getContrastText(fill, '#141414', '#FFFFFF') }}
    >
      <span className="step-check" aria-hidden="true">
        {done && <Check size={16} strokeWidth={3} />}
      </span>
      {/* The glyph sits BESIDE the tick rather than replacing it. The tick is
          the state and has to stay in the same place on every row for the list
          to be scannable; the glyph is identity and changes per row. Merging
          the two — a glyph that becomes a tick — was tried and made a finished
          row unidentifiable, which is the row you most often want to undo. */}
      {Glyph && (
        <span className="step-glyph" aria-hidden="true">
          <Glyph size={17} strokeWidth={1.9} />
        </span>
      )}
      <span className="step-body">
        <span className="step-name">{name}</span>
        {detail && <span className="step-detail">{detail}</span>}
        <span className="step-meta">
          {time && <span className="step-chip"><Clock size={11} />{time}</span>}
          {/* A duration of 0 means "not measured", not "instant" — printing
              "0 min" on two thirds of a stack would be noise claiming to be
              data. */}
          {duration > 0 && <span className="step-chip"><Hourglass size={11} />{duration} min</span>}
          {category && <span className="step-chip">{category.label}</span>}
        </span>
        {warn && <span className="step-warn">{warn}</span>}
      </span>
    </button>
  )
}

/**
 * A gap in the sequence. Not a button, not tickable, and deliberately quiet —
 * it is the one row on the screen that asks nothing of you.
 *
 * It exists as a first-class step because a wait occupies real time between two
 * real things. v1 modelled it as a text field on the habit before the gap,
 * which meant it could never sit between two habits without belonging to one.
 */
export function WaitCard({ minutes, note, label }) {
  return (
    <div className="wait-card" role="separator" aria-label={`Wait ${label}${note ? `. ${note}` : ''}`}>
      <span className="wait-rail" aria-hidden="true" />
      <span className="wait-body">
        <Hourglass size={13} aria-hidden="true" />
        <b>{label}</b>
        {note && <span className="wait-note">{note}</span>}
      </span>
      <span className="wait-rail" aria-hidden="true" />
    </div>
  )
}

/** Swatch grid over a fixed palette — categories and day moods pick from it. */
export function ColorPicker({ value, onChange, palette }) {
  return (
    <div className="swatches" role="group">
      {palette.map(c => (
        <button
          key={c}
          type="button"
          className={`swatch${c === value ? ' is-selected' : ''}`}
          style={{ background: c }}
          aria-label={`Colour ${c}`}
          aria-pressed={c === value}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  )
}

/**
 * A labelled on/off switch that REVEALS something when on.
 *
 * The kit had no switch — only `.check-box`, which is a checkbox in a list and
 * reads as "one of several", not as "this changes what the form asks you".
 * That distinction is the whole point here: scheduling a habit is a mode, and
 * turning it on adds fields.
 *
 * A real <button role="switch"> with aria-checked, so it announces as a switch
 * rather than as a pressed button.
 */
export function Toggle({ checked, onChange, label, hint, children }) {
  return (
    <div className={`toggle-field${checked ? ' is-on' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className="toggle-row"
        onClick={() => onChange(!checked)}
      >
        <span className="grow">
          <span className="toggle-label">{label}</span>
          {hint && <span className="toggle-hint">{hint}</span>}
        </span>
        <span className="toggle-track" aria-hidden="true"><span className="toggle-knob" /></span>
      </button>
      {checked && children && <div className="toggle-body">{children}</div>}
    </div>
  )
}

/* ============================================================================
   DASHBOARD — the week strip and the card set the Home screen is built from.
   ============================================================================
   Same house rule as everything above: these live in the kit with their CSS in
   index.css, because the alternative is three inline styles on one page that
   the next theme swap silently strips.
   ========================================================================== */

/**
 * The week as a row of vertical pills, one per day.
 *
 * WHAT THE SHADE MEANS. A pill's opacity scales with how many steps that day
 * holds, relative to the busiest day in the week — so the strip reads as a
 * workload profile at a glance rather than as seven identical chips. It is
 * RELATIVE ON PURPOSE: an absolute scale would render a nine-step week as seven
 * pale pills and say nothing, and the useful question is always "which of my
 * days are the heavy ones", never "how does my week compare to a stranger's".
 *
 * IT NEVER STARTS AT ZERO. The ramp runs from `MIN_WASH`, not from transparent,
 * because a day with one step still exists and a pill you cannot see reads as a
 * rendering bug.
 *
 * AND IT NEVER REACHES ONE. `MAX_WASH` is the measured ceiling, not a taste
 * call. The pill prints `--text` (near-white) over its day colour washed onto
 * `--surface`, so the more colour it carries the closer the background gets to
 * the ink. At full strength a pill IS the palette entry, and `--text` on
 * Inchworm measures **1.12:1** — invisible. 0.32 is the last step where the
 * worst entry still clears AA (4.71:1); 0.34 fails.
 *
 * BOTH ENDS MOVED WITH THE THEME. On the previous near-black page the window
 * was .14–.34; on this one it is .12–.32. The numbers are a property of the
 * SURFACE, not of the component — which is why they get re-derived every time
 * the theme changes rather than carried across.
 *
 * The alternative was flipping the ink per pill the way `.step-card` does. It
 * was rejected: the flip would land mid-strip, so a week would show some pills
 * with light text and some with dark for no reason a reader can see — the same
 * crossover bug `--heat-ink` was introduced to fix. One ink, capped ramp.
 *
 * `scripts/contrast.mjs` measures BOTH ends. Changing either constant without
 * re-running it is how this shipped broken the first time.
 *
 * REST IS NOT ON THE RAMP. It gets `is-rest` and a solid fill of REST_COLOR
 * under light ink, because "no work today" is a different KIND of day, not the
 * bottom of a workload scale. Sorting it onto the ramp put it next to a
 * genuinely light day and made the two indistinguishable, which is precisely
 * the reading the strip exists to give.
 */
const MIN_WASH = 0.12
const MAX_WASH = 0.32

export function WeekPills({ days, onSelect }) {
  const busiest = Math.max(1, ...days.map(d => d.count || 0))

  return (
    <div className="week-pills" role="list">
      {days.map(d => {
        const ratio = (d.count || 0) / busiest
        const wash = d.count ? MIN_WASH + (MAX_WASH - MIN_WASH) * ratio : 0
        const Tag = onSelect ? 'button' : 'div'
        return (
          <Tag
            key={d.key}
            role="listitem"
            type={onSelect ? 'button' : undefined}
            onClick={onSelect ? () => onSelect(d) : undefined}
            className={[
              'week-pill',
              d.rest ? 'is-rest' : '',
              d.isToday ? 'is-today' : '',
              d.count ? '' : 'is-empty',
            ].filter(Boolean).join(' ')}
            style={{ '--pill-color': d.color || 'var(--neutral-line)', '--pill-wash': wash }}
            aria-current={d.isToday ? 'date' : undefined}
            title={d.title}
          >
            <span className="week-pill-day">{d.label}</span>
            <span className="week-pill-count">{d.rest ? '—' : (d.count || 0)}</span>
          </Tag>
        )
      })}
    </div>
  )
}

/**
 * A dashboard tile: a glyph, a big value, and what it is.
 *
 * `tone` colours the tile from user data (a category colour, a day colour), so
 * it takes the same `--step-ink` treatment `StepCard` does rather than assuming
 * anything about what it was handed. A tile with no tone stays on the surface.
 *
 * It is a BUTTON whenever it has an `onClick`, and a plain div otherwise. The
 * three tiles on Home all navigate, and a div with a click handler is the exact
 * bug the step rows were fixed for in v2: unreachable by keyboard and with no
 * pressed state.
 */
export function StatCard({ glyph, value, label, sub, tone, wide, children, onClick }) {
  const Glyph = glyph
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`stat-card${wide ? ' is-wide' : ''}${onClick ? ' is-tappable' : ''}${tone ? ' is-toned' : ''}`}
      style={tone ? { '--tile-fill': tone, '--tile-ink': getContrastText(tone, '#141414', '#FFFFFF') } : undefined}
    >
      <span className="stat-card-head">
        {Glyph && <span className="stat-card-glyph" aria-hidden="true"><Glyph size={18} strokeWidth={1.9} /></span>}
        <span className="stat-card-label">{label}</span>
      </span>
      <span className="stat-card-value">{value}</span>
      {sub && <span className="stat-card-sub">{sub}</span>}
      {children}
    </Tag>
  )
}

/** The two-across + one-full-width grid the dashboard cards sit in. A card with
 *  `wide` spans both columns; everything else pairs up in source order. */
export function CardGrid({ children }) {
  return <div className="card-grid">{children}</div>
}

/**
 * A labelled progress bar. The plain <Progress> is a bar and nothing else,
 * which is right inside a card that has already said what it is measuring and
 * wrong on a dashboard showing two different bars at once — "76%" with no
 * word beside it is the reading that gets mistaken for the other one.
 */
export function MeterRow({ label, value, sub, tone }) {
  return (
    <div className="meter-row">
      <div className="meter-head">
        <span className="meter-label">{label}</span>
        <span className="meter-value nums">{sub}</span>
      </div>
      <Progress value={value} max={100} tone={tone} />
    </div>
  )
}

/* ============================================================================
   TIME WHEEL — the wake / sleep picker.
   ============================================================================
   A REAL SCROLL WHEEL, not a styled <input type="time">. The native control
   cannot be made to carry a display-sized numeral on either platform, and this
   is the one screen where the number is the whole interface.

   IT IS ALSO A REAL LISTBOX. A wheel that only responds to touch-scroll is
   unreachable by keyboard and silent to a screen reader, which is the same
   class of bug the step rows were fixed for in v2 — a div with a handler
   pretending to be a control. Each column is `role="listbox"`, each value is an
   `option`, arrow keys move the selection, and the scroll position follows the
   selection rather than being the only way to set it.

   MINUTES GO IN FIVES. This picks the two ends of a day, not an alarm: nobody
   holds a considered opinion about waking at 06:37, and sixty snap points on a
   phone-sized wheel is a target you overshoot every time. A value that arrives
   off the grid (from a backup, or from a later version) is still SHOWN — it is
   added to the list rather than rounded away underneath the user.
   ========================================================================== */

const MINUTE_STEP = 5
const pad2 = n => String(n).padStart(2, '0')

function WheelColumn({ label, values, value, onChange, render }) {
  const ref = useRef(null)
  const index = Math.max(0, values.indexOf(value))

  // The selection drives the scroll, never the other way round — so a value
  // set with the keyboard, or restored from state, lands centred like any other.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const item = el.children[index + 1]   // +1: the leading spacer
    if (item) el.scrollTo({ top: item.offsetTop - el.offsetTop - (el.clientHeight - item.clientHeight) / 2, behavior: 'smooth' })
  }, [index])

  const onKeyDown = e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const next = index + (e.key === 'ArrowDown' ? 1 : -1)
    if (next >= 0 && next < values.length) onChange(values[next])
  }

  return (
    <div
      className="wheel-col" ref={ref}
      role="listbox" aria-label={label} tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="wheel-pad" aria-hidden="true" />
      {values.map((v, i) => (
        <button
          key={v} type="button"
          role="option" aria-selected={i === index}
          className={`wheel-item${i === index ? ' is-active' : ''}`}
          onClick={() => onChange(v)}
          tabIndex={-1}
        >
          {render ? render(v) : pad2(v)}
        </button>
      ))}
      <div className="wheel-pad" aria-hidden="true" />
    </div>
  )
}

/**
 * `value` is "HH:MM" (24h, the app's storage format everywhere).
 * `tone` is 'wake' | 'sleep' — it picks the glyph and the backing wash, so the
 * two pickers are tellable apart at a glance without reading their labels.
 */
export function TimeWheel({ value, onChange, tone = 'wake', label }) {
  const parsed = /^(\d{1,2}):(\d{2})$/.exec(value || '')
  const hour = parsed ? Math.min(23, +parsed[1]) : (tone === 'sleep' ? 23 : 7)
  const min  = parsed ? Math.min(59, +parsed[2]) : 0

  const hours = Array.from({ length: 24 }, (_, i) => i)
  const mins = useMemo(() => {
    const base = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP)
    // An off-grid value is shown rather than silently rounded — see the header.
    return base.includes(min) ? base : [...base, min].sort((a, b) => a - b)
  }, [min])

  const set = (h, m) => onChange(`${pad2(h)}:${pad2(m)}`)

  return (
    <div className={`wheel wheel-${tone}`}>
      <div className="wheel-head">
        <span className="wheel-glyph" aria-hidden="true">
          {tone === 'sleep' ? <Moon size={20} strokeWidth={1.8} /> : <Sun size={20} strokeWidth={1.8} />}
        </span>
        <span className="wheel-label">{label}</span>
      </div>
      <div className="wheel-cols">
        <WheelColumn label={`${label} hour`} values={hours} value={hour} onChange={h => set(h, min)} />
        <span className="wheel-colon" aria-hidden="true">:</span>
        <WheelColumn label={`${label} minute`} values={mins} value={min} onChange={m => set(hour, m)} />
      </div>
      {/* The selected value in words, for anything that cannot read a wheel —
          and as the one place the 24h storage format is shown as the user's own
          locale renders it. */}
      <div className="wheel-read" aria-live="polite">{formatClock(`${pad2(hour)}:${pad2(min)}`)}</div>
    </div>
  )
}

function formatClock(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!m) return ''
  const d = new Date()
  d.setHours(+m[1], +m[2], 0, 0)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/* ============================================================================
   ICON PICKER — the glyph grid, grouped.
   ============================================================================
   Sixty icons in one flat grid is a search problem, so it is grouped by what
   the icon is FOR and the headings do the finding. "None" is a real option and
   comes first: no glyph is the default state for most habits, and a picker you
   cannot back out of is one that forces a wrong choice.
   ========================================================================== */

export function IconPicker({ value, onChange, groups }) {
  return (
    <div className="icon-picker">
      <button
        type="button"
        className={`icon-swatch${!value ? ' is-active' : ''}`}
        onClick={() => onChange('')}
        aria-label="No glyph"
        aria-pressed={!value}
      >
        <X size={16} />
      </button>
      {groups.map(g => (
        <div className="icon-group" key={g.label}>
          <div className="icon-group-label">{g.label}</div>
          <div className="icon-grid">
            {g.icons.map(([name, Glyph]) => (
              <button
                key={name} type="button"
                className={`icon-swatch${value === name ? ' is-active' : ''}`}
                onClick={() => onChange(name)}
                aria-label={name} aria-pressed={value === name}
                title={name}
              >
                <Glyph size={18} strokeWidth={1.9} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
