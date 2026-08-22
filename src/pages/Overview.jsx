/* ============================================================================
   OVERVIEW — today, in one look.
   ============================================================================
   Ring → the split that actually matters → this week at a glance. Anything
   needing week navigation belongs on Recap.

   That split used to be a hardcoded supplements-vs-skincare pair. The tags are
   the user's now, so the breakdown is one bar per tag that has a task today —
   which is also why the leading icons went: a per-tag icon would need a picker,
   and the tag chip already says which row is which in the user's own words.
   ========================================================================== */

import { useMemo } from 'react'
import { PageHeader } from '../components/AppShell.jsx'
import { Card, SectionHead, Ring, Progress, Heatmap, Tag } from '../components/UI.jsx'
import { useToday } from '../lib/useToday.js'
import { useStore } from '../lib/store.jsx'
import { buildWeek, weekStats } from '../lib/weeks.js'
import { formatLongDay } from '../lib/dates.js'

export default function Overview() {
  const { routine } = useStore()
  const { date, kind, done, total, pct, byTag, items } = useToday()
  const week  = useMemo(() => buildWeek(items, 0, routine), [items, routine])
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

      {/* Omitted entirely when today's tasks carry no tags — an empty "By tag"
          heading reads as data that failed to load. */}
      {byTag.length > 0 && (
        <>
          <SectionHead title="By tag" sub="today" />
          <Card>
            {byTag.map(({ tag, done: d, total: t }) => (
              <div className="row row-tight" key={tag.id}>
                <div className="grow">
                  <div className="row">
                    <Tag tone={tag.tone}>{tag.label}</Tag>
                    <span className="muted nums">{d}/{t}</span>
                  </div>
                  <Progress value={d} max={t || 1} />
                </div>
              </div>
            ))}
          </Card>
        </>
      )}

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
