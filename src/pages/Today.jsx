/* ============================================================================
   TODAY — the day as a sequence. The screen the app exists for.
   ============================================================================
   One flat list, top to bottom, in the order you arranged it, with waits sitting
   between the steps they separate. No time-block headings any more: the ORDER is
   the structure now, and a heading every three rows was competing with it.

   Colour carries the category, and it DRAINS as you go — see `.step-card.is-done`
   in index.css. The remaining colour is the remaining work.
   ========================================================================== */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RotateCcw, SlidersHorizontal, CalendarPlus } from 'lucide-react'
import { PageHeader } from '../components/AppShell.jsx'
import { Card, Progress, StepCard, WaitCard, Toast, Empty, Button } from '../components/UI.jsx'
import { formatTime, formatWait } from '../lib/routine.js'
import { iconFor } from '../lib/icons.js'
import { formatLongDay } from '../lib/dates.js'
import { useToday } from '../lib/useToday.js'
import { BrandMark } from '../app.config.jsx'

export default function Today() {
  const navigate = useNavigate()
  const { date, steps, kind, done, total, pct, waitMinutes, isDone, toggle, reset } = useToday()
  const [toast, setToast] = useState(null)

  const onToggle = step => {
    // `isDone`, not `checked[...]` — a day logged before schema v3 is keyed by
    // habit id, and reading the map directly would report every one of those
    // rows as un-ticked and then announce "1 of 15" on the way back down.
    const wasDone = isDone(step)
    toggle(step)
    if (wasDone) return
    const next = done + 1
    if (next === total) setToast('All done for today.')
    else if (next % 5 === 0) setToast(`${next} of ${total} done.`)
  }

  return (
    <div className="main-content">
      <PageHeader
        avatar={<BrandMark size={24} />}
        onAvatarClick={() => navigate('/settings')}
        eyebrow={formatLongDay(date)}
        title={kind.label}
        actions={
          <>
            <button className="icon-btn" aria-label="Edit routine" onClick={() => navigate('/routine')}>
              <SlidersHorizontal size={18} />
            </button>
            <button
              className="icon-btn"
              aria-label="Reset today's checklist"
              onClick={() => { if (confirm("Reset all of today's steps?")) reset() }}
            >
              <RotateCcw size={18} />
            </button>
          </>
        }
      />

      {total > 0 && (
        <Card variant="hero">
          <div className="row">
            <div className="figure">{pct}%</div>
            <div className="grow hero-count">
              {done} / {total} done
              {waitMinutes > 0 && <> &middot; {formatWait(waitMinutes)} waiting</>}
            </div>
            {/* mood-on-dark, not mood: this chip sits on the hero's bright
                gradient, where the plain variant inks the mood colour onto a
                wash of itself and measures 1.07:1 — invisible. The day's colour
                cannot be shown here at all; it survives on the week rows, the
                recap and the overview. */}
            {kind.color && (
              <span className="mood mood-on-dark">
                <span className="mood-dot" />{kind.text}
              </span>
            )}
          </div>
          <Progress value={done} max={total} />
        </Card>
      )}

      {steps.map(step => (
        step.kind === 'wait'
          ? <WaitCard key={step.id} minutes={step.minutes} note={step.note} label={formatWait(step.minutes)} />
          : (
            <StepCard
              key={step.id}
              done={isDone(step)}
              name={step.habit.name}
              detail={step.habit.detail}
              /* `step.time`, not `step.habit.time` — resolveSteps has already
                 folded the step's own override over the habit's, which is what
                 lets one "LUMACA Cleanser" read 6:30 AM here and 10:00 PM
                 eleven rows down. */
              time={formatTime(step.time)}
              duration={step.duration}
              glyph={iconFor(step.habit, step.category)}
              category={step.category}
              warn={step.habit.warn}
              onToggle={() => onToggle(step)}
            />
          )
      ))}

      {/* Two ways to land here: a weekday with no template assigned, or a
          template with nothing in it. Both want the same thing offered — the
          editor — rather than a blank screen that reads as broken. */}
      {steps.length === 0 && (
        <Empty
          icon={<CalendarPlus className="big" strokeWidth={1.2} />}
          title="Nothing planned for today"
          action={<Button onClick={() => navigate('/routine')}>Build this day</Button>}
        >
          {formatLongDay(date).split(',')[0]} has no routine yet.
        </Empty>
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
