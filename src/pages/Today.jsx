/* ============================================================================
   TODAY — the checklist. The screen the app exists for.
   ============================================================================
   Order: header → progress hero → one section per time block, in clock order.
   Blocks with no tasks today are omitted entirely rather than shown empty; on a
   rest day there is no pre-workout, and an empty "Pre-Workout" heading reads as
   something forgotten rather than something not scheduled.
   ========================================================================== */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RotateCcw, Clock, Hourglass, AlertTriangle } from 'lucide-react'
import { PageHeader } from '../components/AppShell.jsx'
import { Card, SectionHead, Tag, Progress, TaskRow, Toast } from '../components/UI.jsx'
import { BLOCKS, TAG_TONE } from '../lib/protocol.js'
import { formatLongDay } from '../lib/dates.js'
import { useToday } from '../lib/useToday.js'
import { BrandMark } from '../app.config.jsx'

export default function Today() {
  const navigate = useNavigate()
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
          <button
            className="icon-btn"
            aria-label="Reset today's checklist"
            onClick={() => {
              if (confirm("Reset all of today's tasks?")) reset()
            }}
          >
            <RotateCcw size={18} />
          </button>
        }
      />

      <Card variant="hero">
        <div className="row">
          <div className="grow">
            <div className="muted">Today</div>
            <div className="figure">{pct}%</div>
          </div>
          <Tag tone={kind.tone}>{kind.text}</Tag>
        </div>
        <Progress value={done} max={total}  />
        <div className="muted">{done} / {total} done</div>
      </Card>

      {BLOCKS.map(block => {
        const blockTasks = tasks.filter(t => t.block === block.id)
        if (!blockTasks.length) return null   // not scheduled today — omit, don't empty

        return (
          <section key={block.id}>
            <SectionHead title={block.label} sub={block.time} />
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
                {task.tags.map(t => <Tag key={t} tone={TAG_TONE[t] || 'neutral'}>{t}</Tag>)}
              </TaskRow>
            ))}
          </section>
        )
      })}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
