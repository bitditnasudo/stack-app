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
import { formatLongDay } from '../lib/dates.js'
import { useToday } from '../lib/useToday.js'
import { BrandMark } from '../app.config.jsx'

export default function Today() {
  const navigate = useNavigate()
  const { date, steps, kind, checked, done, total, pct, waitMinutes, toggle, reset } = useToday()
  const [toast, setToast] = useState(null)

  const onToggle = step => {
    const wasDone = !!checked[step.habitId]
    toggle(step.habitId)
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
            {kind.color && (
              <span className="mood" style={{ '--mood-color': kind.color }}>
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
              done={!!checked[step.habitId]}
              name={step.habit.name}
              detail={step.habit.detail}
              time={formatTime(step.habit.time)}
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
