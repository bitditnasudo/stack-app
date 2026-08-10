/* ============================================================================
   OVERVIEW — today, in one look.
   ============================================================================
   Ring → the split that actually matters (supplements vs skincare) → this week
   at a glance. Anything needing week navigation belongs on Recap.
   ========================================================================== */

import { useMemo } from 'react'
import { Pill, Droplets } from 'lucide-react'
import { PageHeader } from '../components/AppShell.jsx'
import { Card, SectionHead, Ring, Progress, Heatmap, Tag } from '../components/UI.jsx'
import { useToday } from '../lib/useToday.js'
import { buildWeek, weekStats } from '../lib/weeks.js'
import { formatLongDay } from '../lib/dates.js'

export default function Overview() {
  const { date, kind, done, total, pct, supp, skin, items } = useToday()
  const week  = useMemo(() => buildWeek(items, 0), [items])
  const stats = useMemo(() => weekStats(week), [week])

  return (
    <div className="main-content">
      <PageHeader eyebrow={formatLongDay(date)} title="Overview" />

      <Card>
        <div className="row">
          <Ring pct={pct} label={`${pct}%`} sub={`${done}/${total}`} />
          <div className="grow">
            <div className="stat-grid">
              <div className="stat">
                <div className="stat-value">{done}</div>
                <div className="stat-label">Done</div>
              </div>
              <div className="stat">
                <div className="stat-value">{total - done}</div>
                <div className="stat-label">Left</div>
              </div>
            </div>
            <div style={{ marginTop: 'var(--sp-3)' }}>
              <Tag tone={kind.tone}>{kind.text}</Tag>
            </div>
          </div>
        </div>
      </Card>

      <SectionHead title="By category" sub="today" />
      <Card>
        <div className="row row-tight">
          <span className="row-icon"><Pill size={16} /></span>
          <div className="grow">
            <div className="row">
              <b className="grow">Supplements</b>
              <span className="muted nums">{supp.done}/{supp.total}</span>
            </div>
            <Progress value={supp.done} max={supp.total || 1}
                       />
          </div>
        </div>
        <div className="row row-tight">
          <span className="row-icon"><Droplets size={16} /></span>
          <div className="grow">
            <div className="row">
              <b className="grow">Skincare</b>
              <span className="muted nums">{skin.done}/{skin.total}</span>
            </div>
            <Progress value={skin.done} max={skin.total || 1}
                       />
          </div>
        </div>
      </Card>

      <SectionHead
        title="This week"
        sub={stats.avg !== null ? `${stats.avg}% avg` : 'no data yet'}
      />
      <Card>
        <Heatmap days={week} />
      </Card>
    </div>
  )
}
