/* ============================================================================
   HOME — the dashboard. Today, in one look.
   ============================================================================
   Was "Overview". The tab reads Home now; the ROUTE is still /overview, because
   a path is an address and renaming one breaks every link that ever pointed at
   it for a word nobody sees.

   WHAT IS ON IT, TOP TO BOTTOM, AND WHY IN THAT ORDER

     Hello, {name}     the only place the onboarding name is used, and the
                       reason it is asked for at all.
     The week          seven pills, shaded by how much each day holds.
     Two meters        how much of the DAY has gone, and how much of the STACK
                       is done. Both, together — see below.
     Three cards       what's next · supplements taken · the gym routine.

   THE TWO METERS ARE NOT ALTERNATIVES AND THE SPEC IS RIGHT TO ASK FOR BOTH.
   One is a clock you do not control, the other is work you do. A day that is
   80% elapsed and 20% done is the single most actionable reading this screen
   produces, and it only exists if both are on it. Showing either one alone
   turns the dashboard into a thing that can only ever tell you what you already
   knew.

   THE ELAPSED BAR IS ABSENT, NOT ZERO, UNTIL WAKE AND SLEEP ARE SET.
   `dayProgress` returns null and this page renders nothing rather than a bar
   sitting at some default nobody chose. A device upgrading into this version
   has never been asked, so it simply shows the ring until it is.

   EVERY CARD IS A TAP TARGET AND THEY ALL GO TO THE SAME PLACE — Today. That is
   deliberate rather than lazy: each card is a WINDOW onto one row of today's
   stack, and the honest destination for "tell me more about this" is the stack
   itself. Three cards leading to three different screens would be three screens
   that each show a subset of one list.
   ========================================================================== */

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pill, Dumbbell, ListChecks } from 'lucide-react'
import { PageHeader } from '../components/AppShell.jsx'
import {
  Card, SectionHead, Ring, Progress, Heatmap, Tag,
  WeekPills, CardGrid, StatCard, MeterRow,
} from '../components/UI.jsx'
import { useToday } from '../lib/useToday.js'
import { useStore } from '../lib/store.jsx'
import { buildWeek, weekStats } from '../lib/weeks.js'
import { formatLongDay } from '../lib/dates.js'
import { iconFor } from '../lib/icons.js'
import {
  DAY_ORDER, DAY_LABELS, DAY_SHORT, habitStepsForDay, dayColorFor, isRestDay,
} from '../lib/routine.js'

/* Which category counts as supplements, and which as the gym.
   ─────────────────────────────────────────────────────────────────────────────
   MATCHED BY LABEL, NOT BY ID, AND THAT IS THE LEAST-BAD OPTION. Categories are
   user data: they can be renamed, deleted or never created, so no id can be
   hardcoded and no card may assume one exists. Matching the label means a user
   who renames "Supplements" to "Stack" loses that card's contents — and the
   card says "none today" rather than breaking, which is the correct failure.

   The alternative is a per-category "role" field, which is a schema addition
   that exists to serve two tiles on one screen. If a third card ever wants one,
   that is the moment to add it. */
const matchCategory = (routine, ...words) =>
  routine.categories.find(c => words.some(w => c.label.toLowerCase().includes(w))) || null

export default function Home() {
  const navigate = useNavigate()
  const { routine, state } = useStore()
  const { date, kind, done, total, pct, elapsedPct, isDone, habitSteps, byCategory, items } = useToday()

  const week  = useMemo(() => buildWeek(items, 0, routine), [items, routine])
  const stats = useMemo(() => weekStats(week), [week])
  const name  = state.profile?.name?.trim()

  /* The seven pills. `count` drives the shade, so it counts HABIT steps only —
     a day is not busier because it contains four waits. */
  const pills = useMemo(() => {
    const todayDay = date.getDay()
    return DAY_ORDER.map(d => {
      const count = habitStepsForDay(routine, d).length
      const rest = isRestDay(routine, d)
      return {
        key: d,
        label: DAY_SHORT[d],
        count,
        rest,
        color: dayColorFor(routine, d),
        isToday: d === todayDay,
        title: `${DAY_LABELS[d]} — ${rest ? 'rest day' : `${count} step${count === 1 ? '' : 's'}`}`,
      }
    })
  }, [routine, date])

  /* ── Card 1: the first thing still to do ─────────────────────────────────
     The spec asks for "the first item in today's stack". Taken literally that
     is a card which stays stuck on a step you finished at 06:30 and reads as
     stale for the rest of the day, so it shows the first UNDONE step and falls
     back to the literal first once everything is ticked. */
  const nextStep = habitSteps.find(s => !isDone(s)) || habitSteps[0] || null

  /* ── Card 2: supplements taken ───────────────────────────────────────────*/
  const suppCat = matchCategory(routine, 'supplement')
  const supps = byCategory.find(b => b.category.id === suppCat?.id) || null

  /* ── Card 3: the gym routine ─────────────────────────────────────────────*/
  const gymCat = matchCategory(routine, 'gym', 'workout', 'training')
  const gymSteps = gymCat ? habitSteps.filter(s => s.habit.categoryId === gymCat.id) : []
  const gymDone = gymSteps.filter(isDone).length
  const gymPct = gymSteps.length ? Math.round((gymDone / gymSteps.length) * 100) : 0
  const gymLead = gymSteps[0] || null

  const toToday = () => navigate('/')

  return (
    <div className="main-content">
      <PageHeader
        eyebrow={formatLongDay(date)}
        title={name ? `Hello, ${name}` : 'Hello'}
      />

      {/* ── The week ────────────────────────────────────────────────────── */}
      <SectionHead title="Your week" sub={kind.label} />
      <WeekPills days={pills} />

      {/* ── Progress: elapsed and done, side by side ────────────────────── */}
      <Card>
        <div className="row">
          <Ring pct={pct} label={`${pct}%`} sub={`${done}/${total}`} />
          <div className="grow">
            {elapsedPct !== null && (
              <MeterRow
                label="Day elapsed"
                value={elapsedPct}
                sub={`${elapsedPct}%`}
              />
            )}
            <MeterRow
              label="Stack done"
              value={total ? (done / total) * 100 : 0}
              sub={`${done} of ${total}`}
              tone="ok"
            />
            <div style={{ marginTop: 'var(--sp-3)' }}>
              {kind.color
                ? <span className="mood" style={{ '--mood-color': kind.color }}>
                    <span className="mood-dot" />{kind.text}
                  </span>
                : <Tag tone="neutral">{kind.text}</Tag>}
            </div>
          </div>
        </div>
        {elapsedPct === null && (
          <p className="prose muted" style={{ fontSize: 'var(--fs-xs)', marginBottom: 0 }}>
            Set your wake and sleep times in Settings to see how much of the day
            has gone beside how much of it you&rsquo;ve done.
          </p>
        )}
      </Card>

      {/* ── The three cards ─────────────────────────────────────────────── */}
      <CardGrid>
        <StatCard
          glyph={nextStep ? iconFor(nextStep.habit, nextStep.category) : ListChecks}
          label={habitSteps.every(isDone) && habitSteps.length ? 'All done' : 'Up next'}
          value={nextStep ? nextStep.habit.name : 'Nothing planned'}
          sub={nextStep?.time || (nextStep?.duration ? `${nextStep.duration} min` : undefined)}
          tone={nextStep?.category?.color}
          onClick={toToday}
        />

        <StatCard
          glyph={Pill}
          label={suppCat?.label || 'Supplements'}
          value={supps ? `${supps.done}/${supps.total}` : '—'}
          sub={supps
            ? (supps.done === supps.total ? 'all taken' : `${supps.total - supps.done} left`)
            : 'none today'}
          onClick={toToday}
        />

        {/* Full width, with the ring — the reference layout's bottom card. */}
        <StatCard wide glyph={Dumbbell} label={gymCat?.label || 'Workout'} value="" onClick={toToday}>
          <span className="stat-card-main">
            <span className="stat-card-value">
              {gymLead ? gymLead.habit.name : (gymCat ? 'Nothing today' : 'No workout category')}
            </span>
            <span className="stat-card-sub">
              {gymSteps.length
                ? `${gymDone} of ${gymSteps.length} completed`
                : 'Add one from the routine editor'}
            </span>
          </span>
          {gymSteps.length > 0 && (
            <span className="stat-card-ring">
              <Ring pct={gymPct} label={`${gymPct}%`} />
            </span>
          )}
        </StatCard>
      </CardGrid>

      {/* Omitted entirely when today's steps carry no categories — an empty
          "By category" heading reads as data that failed to load. */}
      {byCategory.length > 0 && (
        <>
          <SectionHead title="By category" sub="today" />
          <Card>
            {byCategory.map(({ category, done: d, total: t }) => (
              <div className="row row-tight" key={category.id}>
                <div className="grow">
                  <div className="row">
                    <span className="cat-chip" style={{ '--mood-color': category.color }}>
                      <span className="mood-dot" />{category.label}
                    </span>
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
