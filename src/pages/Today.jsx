/* ============================================================================
   TODAY — the day as a sequence. The screen the app exists for.
   ============================================================================
   One flat list, top to bottom, in the order you arranged it, with waits sitting
   between the steps they separate.

   IT IS ALSO THE ONLY "TODAY" SCREEN NOW. Home re-showed this page's score three
   ways plus an "up next" tile that pointed back here. The one reading Home had
   that this page lacked — how much of the waking DAY has gone, beside how much
   of the STACK is done — is a line in the hero now. That gap (80% of the day
   gone, 20% done) is the actionable reading; it does not need its own tab.

   Colour carries the category, and it DRAINS as you go — see `.step-card.is-done`
   in index.css. Finished rows also drop their detail line, so the list gets
   shorter as the day goes and the remaining work stays on screen.
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
import { useStore } from '../lib/store.jsx'
import { BrandMark } from '../app.config.jsx'

export default function Today() {
  const navigate = useNavigate()
  const { state } = useStore()
  const { date, steps, kind, done, total, pct, elapsedPct, waitMinutes, isDone, toggle, reset } = useToday()
  const [toast, setToast] = useState(null)
  const name = state.profile?.name?.trim()

  const onToggle = step => {
    // `isDone`, not `checked[...]` — a day logged before schema v3 is keyed by
    // habit id, and reading the map directly would misreport those rows.
    const wasDone = isDone(step)
    toggle(step)
    // One toast, at the finish. The old "5 of 15 done" every fifth tick was a
    // pop-up repeating the number already printed in the hero.
    if (!wasDone && done + 1 === total) setToast('All done for today.')
  }

  return (
    <div className="main-content">
      <PageHeader
        avatar={<BrandMark size={24} />}
        onAvatarClick={() => navigate('/settings')}
        eyebrow={name ? `Hi ${name} · ${formatLongDay(date)}` : formatLongDay(date)}
        title={kind.label}
        actions={
          <>
            <button className="icon-btn" aria-label="Edit routine" onClick={() => navigate('/routine')}>
              <SlidersHorizontal size={18} />
            </button>
            <button
              className="icon-btn"
              aria-label="Reset today's checklist"
              onClick={() => { if (confirm("Untick all of today's steps?")) reset() }}
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
              {/* Absent, not zero, until wake and sleep are set in Settings —
                  a bar at a default nobody chose would be a lie. */}
              {elapsedPct !== null && <><br />{elapsedPct}% of your day gone</>}
            </div>
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
                 folded the step's own override over the habit's. */
              time={formatTime(step.time)}
              duration={step.duration}
              glyph={iconFor(step.habit, step.category)}
              category={step.category}
              warn={step.habit.warn}
              onToggle={() => onToggle(step)}
            />
          )
      ))}

      {/* A weekday with no routine, or a routine with nothing in it. The button
          opens THIS weekday's routine directly rather than the editor's front
          page, where you would have to find the day again. */}
      {steps.length === 0 && (
        <Empty
          icon={<CalendarPlus className="big" strokeWidth={1.2} />}
          title="Nothing planned for today"
          action={<Button onClick={() => navigate(`/routine?day=${date.getDay()}`)}>Build this day</Button>}
        >
          {formatLongDay(date).split(',')[0]} has no steps yet.
        </Empty>
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
