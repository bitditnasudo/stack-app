/* ============================================================================
   BUILD WEEK — the guided day-by-day stack builder.
   ============================================================================
   Section 3 of the spec, as its own flow rather than as a landing in the
   editor. One weekday per screen, starting at the day you picked during
   onboarding and walking forward through the week.

   WHY THIS EXISTS WHEN `/routine` ALREADY EDITS DAYS
   The editor is a REFERENCE surface: four tabs, everything reachable, nothing
   sequenced. That is right when you know which day you came to change and
   wrong when you have seven empty days and no idea where to start. This screen
   answers exactly one question at a time and always says how many are left.

   IT SHARES THE EDITOR'S GUTS AND OWNS ONLY ITS FLOW. The step list, the
   picker, the wait editor and the habit sheet all come from
   `components/StackBuilder.jsx` — see that file's header. What lives here is
   the walk: which day, what to do with it, and how to get to the next one.

   ── THE ONE MODELLING DECISION THIS SCREEN MAKES ──────────────────────────
   §3.4 says a day may "choose an existing template (pre-fills the stack)".
   In STACK's model, pointing a weekday at a template means the two SHARE it —
   that is the entire reason templates exist, and it is what makes Mon/Wed/Fri
   one thing to edit rather than three. "Pre-fill" could also mean "copy it and
   let this day diverge", which is a different and equally reasonable reading.

   Both are offered, on the same row, because the difference is invisible until
   it bites and neither is a safe default to guess:

     RUN IT   this day shares the routine. Editing it later edits every day
              running it, and the row says which days those are.
     COPY IT  a duplicate with fresh step ids, on this day only.

   Copying by default would produce seven near-identical templates, which is
   precisely the mess templates exist to prevent. Sharing by default without
   saying so would let someone build Tuesday and silently rewrite Monday.

   ── WHAT IT WRITES, AND WHEN ──────────────────────────────────────────────
   Unlike onboarding, this commits as you go: a day's steps are edited through
   the same pure helpers the editor uses, so they land immediately. There is no
   draft to lose and no Save button to forget. Leaving halfway keeps everything
   built so far, which is the behaviour a seven-screen flow has to have.
   ========================================================================== */

import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight, ArrowLeft, Check, Plus, Copy, SkipForward, BedDouble, Sparkles,
} from 'lucide-react'
import { PageHeader } from '../components/AppShell.jsx'
import {
  Card, SectionHead, Button, Tag, Field, Sheet, Toast, ColorPicker, Toggle, Steps,
} from '../components/UI.jsx'
import { SequenceEditor, daysSummary } from '../components/StackBuilder.jsx'
import { useStore } from '../lib/store.jsx'
import {
  newId, PALETTE, DAY_LABELS, weekFrom,
  templateForDay, daysForTemplate, resolveSteps, getTemplate,
  dayColorFor, setDayColor, formatWait, totalWaitMinutes, totalDayMinutes,
  upsertTemplate, assignDay, duplicateTemplate, renameTemplate,
} from '../lib/routine.js'

export default function BuildWeek() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { routine, setRoutine } = useStore()

  const startDay = Number(params.get('day'))
  const order = useMemo(() => weekFrom(startDay), [startDay])

  const [at, setAt] = useState(0)
  const [toast, setToast] = useState(null)
  const [naming, setNaming] = useState(null)

  const day = order[at]
  const tpl = templateForDay(routine, day)
  const isLast = at === order.length - 1
  const say = m => setToast(m)

  const finish = () => navigate('/', { replace: true })

  /* §3.3 — the day is saved as a named template before you move on. In this
     model a day IS a template, so there is no separate "save" step; what the
     popup actually collects is the NAME, which is the thing that makes it
     selectable on later days. Untitled routines would all read "Untitled" in
     the picker three screens from now. */
  const advance = () => {
    if (tpl && !tpl.title.trim()) { setNaming({ id: tpl.id, value: '' }); return }
    if (isLast) finish()
    else setAt(at + 1)
  }

  return (
    <div className="main-content">
      <PageHeader
        avatar={<ArrowLeft size={20} />}
        onAvatarClick={() => (at === 0 ? navigate('/', { replace: true }) : setAt(at - 1))}
        eyebrow={`Day ${at + 1} of ${order.length}`}
        title={DAY_LABELS[day]}
        actions={
          <button className="icon-btn" aria-label="Finish and go to Today" onClick={finish}>
            <Check size={18} />
          </button>
        }
      />

      <Steps count={order.length} current={at} />

      {tpl
        ? <DayEditor
            routine={routine} setRoutine={setRoutine}
            day={day} tpl={tpl} onToast={say}
            onRename={() => setNaming({ id: tpl.id, value: tpl.title })}
          />
        : <DayChoice
            routine={routine} setRoutine={setRoutine}
            day={day} onToast={say}
            onSkip={advance}
          />}

      {tpl && (
        <div className="build-nav">
          <Button block onClick={advance}>
            {isLast ? <>Finish <Check size={15} /></> : <>Next day <ArrowRight size={15} /></>}
          </Button>
        </div>
      )}

      <p className="prose muted" style={{ fontSize: 'var(--fs-xs)' }}>
        Saves as you go — stop whenever you like.
      </p>

      {naming && (
        <NameSheet
          value={naming.value}
          onSave={title => {
            setRoutine(r => renameTemplate(r, naming.id, title))
            setNaming(null)
            say('Saved.')
            if (isLast) finish(); else setAt(a => a + 1)
          }}
          onClose={() => setNaming(null)}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

/* ── An unplanned day: start fresh, reuse, copy, or skip ────────────────── */

function DayChoice({ routine, setRoutine, day, onToast, onSkip }) {
  const fresh = () => {
    const t = {
      id: newId('tpl'), title: '', rest: false,
      color: PALETTE[routine.templates.length % PALETTE.length], steps: [],
    }
    setRoutine(r => assignDay(upsertTemplate(r, t), day, t.id))
    onToast('Started.')
  }

  const use = id => { setRoutine(r => assignDay(r, day, id)); onToast('Added to this day.') }

  const copy = id => {
    const src = getTemplate(routine, id)
    setRoutine(r => {
      const next = duplicateTemplate(r, id, `${src.title} (${DAY_LABELS[day].slice(0, 3)})`)
      const made = next.templates[next.templates.length - 1]
      return assignDay(next, day, made.id)
    })
    onToast('Copied for this day.')
  }

  return (
    <>
      <Card>
        <div className="row row-tight">
          <span className="row-icon"><Sparkles size={16} /></span>
          <div className="grow">
            <b>Nothing on {DAY_LABELS[day]} yet</b>
            <div className="muted">
              Build it from scratch, or start from one of the days you have
              already made.
            </div>
          </div>
        </div>
      </Card>

      <Button block onClick={fresh}><Plus size={15} /> Start fresh</Button>

      {routine.templates.length > 0 && (
        <>
          <SectionHead title="Or start from one you've built" />
          <Card>
            {routine.templates.map(t => {
              const days = daysForTemplate(routine, t.id)
              const n = t.steps.filter(s => s.kind === 'habit').length
              return (
                <div className="build-pick" key={t.id}>
                  <span className={`cat-chip${t.rest ? ' is-rest' : ''}`}
                        style={{ '--mood-color': t.color }}>
                    <span className="mood-dot" />{t.title || 'Untitled'}
                  </span>
                  <span className="grow build-pick-meta">
                    {n} step{n === 1 ? '' : 's'}
                    {days.length > 0 && <> · {daysSummary(days)}</>}
                  </span>
                  {/* Two verbs, because the difference between them is the one
                      thing this screen cannot guess. See the header. */}
                  <Button size="sm" onClick={() => use(t.id)}>Run it</Button>
                  <Button size="sm" variant="secondary" onClick={() => copy(t.id)}>
                    <Copy size={13} /> Copy
                  </Button>
                </div>
              )
            })}
          </Card>
          <p className="prose muted" style={{ fontSize: 'var(--fs-xs)' }}>
            <b>Run it</b> shares it (edit once, all change). <b>Copy</b> makes
            one for {DAY_LABELS[day]} alone.
          </p>
        </>
      )}

      <Button variant="plain" block onClick={onSkip}>
        <SkipForward size={15} /> Nothing on this day
      </Button>
    </>
  )
}

/* ── A planned day: name, colour, rest, and the sequence ────────────────── */

function DayEditor({ routine, setRoutine, day, tpl, onToast, onRename }) {
  const steps = resolveSteps(routine, tpl)
  const habits = steps.filter(s => s.kind === 'habit').length
  const shared = daysForTemplate(routine, tpl.id)
  const mins = totalDayMinutes(steps)

  /* The colour is the ROUTINE's, same as in the editor. The per-day override
     was dropped from the UI as bulk; picking a colour here also clears any
     override this day still carries, so what you pick is what you see. */
  const colour = dayColorFor(routine, day)
  const setColour = c => setRoutine(r => {
    let next = upsertTemplate(r, { ...getTemplate(r, tpl.id), color: c })
    for (const d of daysForTemplate(next, tpl.id)) next = setDayColor(next, d, null)
    return next
  })

  return (
    <>
      <Card>
        <div className="row row-tight">
          <span className={`cat-chip${tpl.rest ? ' is-rest' : ''}`}
                style={{ '--mood-color': colour }}>
            <span className="mood-dot" />{tpl.title || 'Untitled'}
          </span>
          <span className="grow muted">
            {habits} step{habits === 1 ? '' : 's'}
            {mins > 0 && <> · {formatWait(mins)}</>}
          </span>
          <Button size="sm" variant="secondary" onClick={onRename}>
            {tpl.title.trim() ? 'Rename' : 'Name it'}
          </Button>
        </div>
        {shared.length > 1 && (
          <p className="prose muted" style={{ fontSize: 'var(--fs-xs)', marginBottom: 0 }}>
            Shared with <b>{daysSummary(shared)}</b> — changes here reach all of
            them.
          </p>
        )}
      </Card>

      <SectionHead
        title="The sequence"
        sub={steps.length
          ? `${habits} habit${habits === 1 ? '' : 's'} · ${formatWait(totalWaitMinutes(steps))} waiting`
          : undefined}
      />
      <SequenceEditor
        routine={routine} setRoutine={setRoutine}
        templateId={tpl.id} onToast={onToast}
      />

      <Card>
        {/* `rest` is a flag on the ROUTINE, so it lands on every day running
            it — the hint says so when that is more than this one day. */}
        <Toggle
          checked={!!tpl.rest}
          onChange={on => setRoutine(r => upsertTemplate(r, { ...getTemplate(r, tpl.id), rest: on }))}
          label="Rest day"
          hint={shared.length > 1 ? `Applies to ${daysSummary(shared)}.` : undefined}
        />
        {!tpl.rest && (
          <Field label="Colour">
            <ColorPicker value={colour} onChange={setColour} palette={PALETTE} />
          </Field>
        )}
      </Card>
    </>
  )
}

/** §3.3's popup. It is the one thing standing between you and a picker full of
 *  rows that all read "Untitled" two days from now, so it is required. */
function NameSheet({ value, onSave, onClose }) {
  const [title, setTitle] = useState(value || '')
  const ok = !!title.trim()

  return (
    <Sheet title="Name this day" onClose={onClose}>
      <Field
        label="What kind of day is it?"
        hint="The mood, not the weekday — “Gym”, “Slow Sunday”, “Deload”. You'll pick it by this name when you build the rest of the week."
      >
        <input
          value={title} autoFocus maxLength={40}
          placeholder="Gym"
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && ok) onSave(title) }}
        />
      </Field>
      <Button block disabled={!ok} onClick={() => onSave(title)}>
        Save and continue <ArrowRight size={15} />
      </Button>
    </Sheet>
  )
}
