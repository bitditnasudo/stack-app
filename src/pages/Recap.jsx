/* ============================================================================
   RECAP — any week, navigable backwards.
   ============================================================================
   Forward navigation stops at the current week: there is nothing to recap about
   a week that hasn't happened, and letting the offset go positive produced a
   grid of seven "no data" cells that read like lost history.
   ========================================================================== */

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react'
import { PageHeader } from '../components/AppShell.jsx'
import { Card, SectionHead, Heatmap, Progress, Tag, Empty } from '../components/UI.jsx'
import { useStore } from '../lib/store.jsx'
import { buildWeek, weekStats } from '../lib/weeks.js'
import { getWeekStartMonday, formatWeekRange } from '../lib/dates.js'

export default function Recap() {
  const { state, routine } = useStore()
  const [offset, setOffset] = useState(0)

  const week  = useMemo(() => buildWeek(state.items, offset, routine), [state.items, offset, routine])
  const stats = useMemo(() => weekStats(week), [week])

  const rangeLabel =
    offset === 0  ? 'This week' :
    offset === -1 ? 'Last week' :
    formatWeekRange(getWeekStartMonday(offset))

  return (
    <div className="main-content">
      <PageHeader eyebrow="Weekly" title="Recap" />

      <div className="row">
        <button className="icon-btn" aria-label="Previous week" onClick={() => setOffset(o => o - 1)}>
          <ChevronLeft size={18} />
        </button>
        <div className="grow center"><b>{rangeLabel}</b></div>
        <button
          className="icon-btn" aria-label="Next week"
          disabled={offset >= 0}
          onClick={() => setOffset(o => Math.min(0, o + 1))}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <Card>
        <Heatmap days={week} />
      </Card>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-value">{stats.avg !== null ? `${stats.avg}%` : '—'}</div>
          <div className="stat-label">Average</div>
        </div>
        <div className="stat">
          <div className="stat-value">{stats.best !== null ? `${stats.best}%` : '—'}</div>
          <div className="stat-label">Best day</div>
        </div>
        <div className="stat">
          <div className="stat-value">{stats.streak > 0 ? `${stats.streak}d` : '—'}</div>
          <div className="stat-label">Streak</div>
        </div>
      </div>

      <SectionHead title="Day by day" sub={`${stats.loggedCount} logged`} />

      {stats.loggedCount === 0 ? (
        <Empty
          icon={<CalendarRange className="big" strokeWidth={1.2} />}
          title="Nothing logged this week"
        >
          Days you open and tick off will show up here.
        </Empty>
      ) : (
        <Card>
          {week.map(day => (
            <div
              key={day.key}
              className={`day-row${day.isToday ? ' is-today' : ''}${day.isFuture ? ' is-future' : ''}`}
            >
              <div className="day-row-name">{day.label}</div>
              <div className="grow">
                <Progress
                  value={day.isFuture || day.pct === null ? 0 : day.pct}
                  max={100}
                  tone={day.pct !== null && day.pct < 40 ? 'warn' : undefined}
                />
              </div>
              <div className="day-row-stats">
                {day.isFuture ? 'upcoming'
                  : day.pct === null ? 'no data'
                  : `${day.done}/${day.total}`}
              </div>
              {/* Same markup as Today and Overview, dot included — it shipped
                  without one, which made three call sites of one component
                  render two different ways. */}
              {day.kind.color
                ? <span className="mood" style={{ '--mood-color': day.kind.color }}>
                    <span className="mood-dot" />{day.kind.text}
                  </span>
                : <Tag tone="neutral">{day.kind.text}</Tag>}
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
