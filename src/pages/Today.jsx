/* ============================================================================
   TODAY — the checklist. The screen the app exists for.
   ============================================================================
   Order: header → progress hero → one section per time block, in clock order.
   Blocks with no tasks today are omitted entirely rather than shown empty; on a
   rest day there is no pre-workout, and an empty "Pre-Workout" heading reads as
   something forgotten rather than something not scheduled.

   Blocks, tags and tasks all come from the user's routine now. The pencil in
   the header goes to the editor: this is the screen where you notice a step is
   missing, so it is the screen that has to offer the way to add it.
   ========================================================================== */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RotateCcw, Clock, Hourglass, AlertTriangle, SlidersHorizontal, ListPlus } from 'lucide-react'
import { PageHeader } from '../components/AppShell.jsx'
import { Card, SectionHead, Tag, Progress, TaskRow, Toast, Empty, Button } from '../components/UI.jsx'
import { formatTimeRange } from '../lib/routine.js'
import { formatLongDay } from '../lib/dates.js'
import { useToday } from '../lib/useToday.js'
import { useStore } from '../lib/store.jsx'
import { BrandMark } from '../app.config.jsx'

export default function Today() {
  const navigate = useNavigate()
  const { routine } = useStore()
  const { date, tasks, kind, checked, done, total, pct, toggle, reset } = useToday()
  const [toast, setToast] = useState(null)

  const onToggle = task => {
    const wasDone = !!checked[task.id]
    toggle(task.id)
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
            <button
              className="icon-btn"
              aria-label="Edit routine"
              onClick={() => navigate('/routine')}
            >
              <SlidersHorizontal size={18} />
            </button>
            <button
              className="icon-btn"
              aria-label="Reset today's checklist"
              onClick={() => {
                if (confirm("Reset all of today's tasks?")) reset()
              }}
            >
              <RotateCcw size={18} />
            </button>
          </>
        }
      />

      {/* One row, not three. This card used to stack a "Today" label, the
          figure, the bar and a "{done} / {total} done" line, which pushed the
          first tappable task to y=257 — a third of a 812px phone spent before
          the thing the app is for. The label was redundant with the date in the
          header directly above it, and the count now sits beside the figure it
          is a count of rather than under the bar. */}
      <Card variant="hero">
        <div className="row">
          <div className="figure">{pct}%</div>
          <div className="grow hero-count">{done} / {total} done</div>
          <Tag tone={kind.tone}>{kind.text}</Tag>
        </div>
        <Progress value={done} max={total} />
      </Card>

      {routine.blocks.map(block => {
        const blockTasks = tasks.filter(t => t.block === block.id)
        if (!blockTasks.length) return null   // not scheduled today — omit, don't empty

        return (
          <section key={block.id}>
            <SectionHead title={block.label} sub={formatTimeRange(block.start, block.end)} />
            {blockTasks.map(task => (
              <TaskRow
                key={task.id}
                done={!!checked[task.id]}
                name={task.name}
                detail={task.detail}
                onToggle={() => onToggle(task)}
              >
                {/* Icons are unsized on purpose — .tag sizes its own svg, so the
                    type step stays a CSS decision. */}
                {task.target && <Tag tone="brand"><Clock />{task.target}</Tag>}
                {task.warn   && <Tag tone="danger"><AlertTriangle />{task.warn}</Tag>}
                {task.wait   && <Tag tone="warn"><Hourglass />{task.wait}</Tag>}
                {task.tags.map(id => {
                  const tag = routine.tags.find(x => x.id === id)
                  return tag ? <Tag key={id} tone={tag.tone}>{tag.label}</Tag> : null
                })}
              </TaskRow>
            ))}
          </section>
        )
      })}

      {/* Reachable two ways now: a brand-new install whose routine was emptied,
          and a day that genuinely has nothing scheduled. Both want the same
          thing offered — the editor — rather than a blank screen that looks
          broken. */}
      {!total && (
        <Empty
          icon={<ListPlus className="big" strokeWidth={1.2} />}
          title="Nothing scheduled today"
          action={<Button onClick={() => navigate('/routine')}>Edit routine</Button>}
        >
          No task in your routine runs on a {formatLongDay(date).split(',')[0]}.
        </Empty>
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
