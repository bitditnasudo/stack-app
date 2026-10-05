/* ============================================================================
   ROUTINE — the editor.
   ============================================================================
   Three tabs:

     WEEK        the seven days and which routine each runs, then every routine
                 (including ones on no day). Tap either to edit that routine.
     HABITS      the library of things you do.
     CATEGORIES  workout / supplement / skincare / leisure. Almost never.

   Week and Routines used to be two tabs showing the same relation from both
   ends (day → routine, routine → days), plus a "Quick actions" card that listed
   every routine a third time for Rename/Copy. One screen now holds both lists,
   and rename/copy/delete live inside the routine sheet.

   EVERYTHING SAVES AS YOU EDIT. The routine sheet used to hold its name, days,
   colour and rest flag in a draft that only a "Save" button committed — and
   that button wrote the draft's STALE copy of the steps back over the live
   ones, silently undoing every step you had just added, moved or removed (and
   wiping a new routine to empty). Identity fields now commit on change, merged
   onto the live template, so steps are never part of a draft at all.

   Every mutation goes through a pure helper from lib/routine.js handed to
   `setRoutine`, so this file never does list surgery.
   ========================================================================== */

import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Plus, RotateCcw, Clock, CalendarOff, Copy, BedDouble } from 'lucide-react'
import { PageHeader } from '../components/AppShell.jsx'
import {
  Card, SectionHead, Button, Tag, Field, Sheet, Toast, Segmented,
  DayPicker, ColorPicker, EditRow, Toggle,
} from '../components/UI.jsx'
/* The day-sequence UI is SHARED with pages/BuildWeek.jsx — see the header of
   components/StackBuilder.jsx for why it is not duplicated here. */
import { SequenceEditor, HabitSheet, blankHabit, daysSummary } from '../components/StackBuilder.jsx'
import { useStore } from '../lib/store.jsx'
import {
  newId, PALETTE, DAY_ORDER, DAY_LABELS,
  templateForDay, daysForTemplate, resolveSteps, habitDays, isUnusedHabit,
  formatTime, formatWait, totalWaitMinutes, getCategory, getTemplate,
  dayColorFor, setDayColor,
  upsertCategory, removeCategory,
  upsertTemplate, removeTemplate, duplicateTemplate, setTemplateDays,
} from '../lib/routine.js'

const TABS = [
  { value: 'week', label: 'Week' },
  { value: 'habits', label: 'Habits' },
  { value: 'cats', label: 'Categories' },
]

const habitCount = t => t.steps.filter(s => s.kind === 'habit').length

export default function Routine() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { routine, setRoutine, resetRoutine } = useStore()
  const [tab, setTab] = useState('week')
  const [editing, setEditing] = useState(null)
  const [toast, setToast] = useState(null)

  const close = () => setEditing(null)
  const say = m => setToast(m)

  /* A new routine is created IMMEDIATELY, not on a Save press — it has to exist
     for its steps to be added, and a routine you can lose by closing a sheet is
     the bug this file was rewritten to remove. Closing a new routine that was
     never named or filled removes it again. */
  const createRoutine = days => {
    const t = {
      id: newId('tpl'), title: '', rest: false,
      color: PALETTE[routine.templates.length % PALETTE.length], steps: [],
    }
    setRoutine(r => setTemplateDays(upsertTemplate(r, t), t.id, days))
    setEditing({ kind: 'template', id: t.id, isNew: true })
  }

  /* `?day=N` opens that weekday's routine straight away (Today's empty state
     links here). Consumed, so a reload does not reopen a closed sheet. */
  useEffect(() => {
    const raw = params.get('day')
    if (raw == null) return
    const d = Number(raw)
    setParams({}, { replace: true })
    if (!Number.isInteger(d) || d < 0 || d > 6) return
    const tpl = templateForDay(routine, d)
    if (tpl) setEditing({ kind: 'template', id: tpl.id })
    else createRoutine([d])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="main-content">
      <PageHeader
        avatar={<ChevronLeft size={20} />}
        onAvatarClick={() => navigate(-1)}
        eyebrow="Edit"
        title="Routine"
        actions={
          <button
            className="icon-btn icon-btn-danger"
            aria-label="Reset routine to the starting one"
            onClick={() => {
              if (confirm('Replace your routine with the starting one?\n\n'
                + 'Every habit, day and category goes back to what STACK ships with. '
                + 'Your logged days are not touched.')) {
                resetRoutine(); say('Routine reset.')
              }
            }}
          >
            <RotateCcw size={18} />
          </button>
        }
      />

      <Segmented options={TABS} value={tab} onChange={setTab} />

      {tab === 'week'   && <WeekTab routine={routine} onOpen={id => setEditing({ kind: 'template', id })} onCreate={createRoutine} />}
      {tab === 'habits' && <HabitsTab routine={routine} onEdit={setEditing} />}
      {tab === 'cats'   && <CatsTab   routine={routine} onEdit={setEditing} />}

      {editing?.kind === 'template' && (
        <TemplateSheet
          key={editing.id}
          routine={routine} setRoutine={setRoutine}
          id={editing.id} isNew={!!editing.isNew}
          onOpen={id => setEditing({ kind: 'template', id })}
          onClose={close} onToast={say}
        />
      )}
      {editing?.kind === 'habit' && (
        <HabitSheet
          routine={routine} setRoutine={setRoutine} editing={editing}
          onClose={close} onToast={say}
        />
      )}
      {editing?.kind === 'cat' && (
        <CatSheet
          routine={routine} setRoutine={setRoutine} editing={editing}
          onClose={close} onToast={say}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

/* ── Week ────────────────────────────────────────────────────────────────────
   The days, then the routines. Both lists open the same sheet. */

function WeekTab({ routine, onOpen, onCreate }) {
  return (
    <>
      <SectionHead title="The week" />
      <Card>
        {DAY_ORDER.map(d => {
          const tpl = templateForDay(routine, d)
          return (
            <div className="week-row" key={d}>
              <span className="week-day">{DAY_LABELS[d].slice(0, 3)}</span>
              {tpl ? (
                <button
                  className="week-slot"
                  style={{ '--mood-color': dayColorFor(routine, d) }}
                  onClick={() => onOpen(tpl.id)}
                >
                  <span className="mood-dot" />
                  <span className="grow">{tpl.title || 'Untitled'}</span>
                  {tpl.rest && <BedDouble size={14} aria-label="Rest day" />}
                  <span className="week-count">{habitCount(tpl)}</span>
                </button>
              ) : (
                <button className="week-slot is-empty" onClick={() => onCreate([d])}>
                  <span className="grow">Nothing planned — tap to build</span>
                  <Plus size={15} />
                </button>
              )}
            </div>
          )
        })}
      </Card>

      <SectionHead
        title="Routines"
        sub={`${routine.templates.length}`}
        action={
          <button className="icon-btn" aria-label="Add a routine" onClick={() => onCreate([])}>
            <Plus size={18} />
          </button>
        }
      />
      <Card>
        {!routine.templates.length && (
          <div className="block-empty">No routines yet. Add one, then put it on some days.</div>
        )}
        {routine.templates.map(t => {
          const days = daysForTemplate(routine, t.id)
          const n = habitCount(t)
          return (
            <EditRow
              key={t.id}
              title={t.title || 'Untitled'}
              warn={days.length === 0}
              meta={
                <>
                  <span className={`cat-chip${t.rest ? ' is-rest' : ''}`} style={{ '--mood-color': t.color }}>
                    <span className="mood-dot" />{n} step{n === 1 ? '' : 's'}
                  </span>
                  {days.length
                    ? <Tag tone="neutral">{daysSummary(days)}</Tag>
                    : <Tag tone="warn"><CalendarOff />On no day</Tag>}
                </>
              }
              onEdit={() => onOpen(t.id)}
            />
          )
        })}
      </Card>
      <p className="prose muted" style={{ fontSize: 'var(--fs-xs)' }}>
        Days running the same routine share it — edit it once and they all change.
      </p>
    </>
  )
}

/* ── The routine sheet ───────────────────────────────────────────────────────
   Name, days, rest, colour, and the sequence. Every field writes straight to
   the live template; there is no draft and no Save button to forget. */

function TemplateSheet({ routine, setRoutine, id, isNew, onOpen, onClose, onToast }) {
  const live = getTemplate(routine, id)
  // The title is the one field kept locally while typing, so clearing it to
  // retype does not flash "Untitled" across the week behind the sheet.
  const [title, setTitle] = useState(live?.title || '')

  if (!live) return null

  const days = daysForTemplate(routine, id)
  const steps = resolveSteps(routine, live)
  const habits = steps.filter(s => s.kind === 'habit').length

  /* Merged onto the CURRENT template inside the updater — never onto a copy
     taken when the sheet opened, which is exactly how the old Save button
     reverted the steps. */
  const patch = p => setRoutine(r => {
    const cur = getTemplate(r, id)
    return cur ? upsertTemplate(r, { ...cur, ...p }) : r
  })

  const commitTitle = () => {
    const t = title.trim().slice(0, 40)
    if (t && t !== live.title) patch({ title: t })
  }

  /* Picking a colour here is the colour you see: it also clears any per-day
     override on the days running this routine, which otherwise made the
     picker look broken (the day kept its old colour). */
  const setColor = color => setRoutine(r => {
    const cur = getTemplate(r, id)
    if (!cur) return r
    let next = upsertTemplate(r, { ...cur, color })
    for (const d of daysForTemplate(next, id)) next = setDayColor(next, d, null)
    return next
  })

  const done = () => {
    commitTitle()
    // A brand-new routine abandoned with no name and no steps is removed rather
    // than left behind as an empty "Untitled" on the week.
    if (isNew && !title.trim() && !live.steps.length) setRoutine(r => removeTemplate(r, id))
    onClose()
  }

  return (
    <Sheet title={isNew ? 'New routine' : (live.title || 'Routine')} onClose={done}>
      <Field label="Name" hint="The kind of day — “Gym”, “Rest”, “Slow Sunday”.">
        <input value={title} maxLength={40} placeholder="Gym" autoFocus={isNew}
               onChange={e => setTitle(e.target.value)} onBlur={commitTitle}
               onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
      </Field>

      <Field label="Days" hint={days.length > 1 ? 'These days share it — changes reach all of them.' : undefined}>
        <DayPicker value={days} onChange={next => setRoutine(r => setTemplateDays(r, id, next))} />
      </Field>

      <Toggle
        checked={!!live.rest}
        onChange={on => patch({ rest: on })}
        label="Rest day"
        hint="Shown in the rest colour, off the busy-ness scale."
      />

      {!live.rest && (
        <Field label="Colour">
          <ColorPicker value={live.color} onChange={setColor} palette={PALETTE} />
        </Field>
      )}

      <SectionHead
        title="Steps"
        sub={steps.length
          ? `${habits} habit${habits === 1 ? '' : 's'}${totalWaitMinutes(steps) ? ` · ${formatWait(totalWaitMinutes(steps))} waiting` : ''}`
          : undefined}
      />
      <SequenceEditor routine={routine} setRoutine={setRoutine} templateId={id} onToast={onToast} />

      <Button block onClick={done} style={{ marginTop: 'var(--sp-4)' }}>Done</Button>

      {!isNew && (
        <div className="field-row" style={{ marginTop: 'var(--sp-2)' }}>
          <Button variant="secondary" block onClick={() => {
            commitTitle()
            // Built from the live document here so the new id is known up front;
            // the copy opens straight away, because the obvious next move (put
            // it on a day) should be one tap, not a hunt through the list.
            const made = duplicateTemplate(routine, id)
            const copy = made.templates[made.templates.length - 1]
            setRoutine(r => upsertTemplate(r, copy))
            onToast('Copied — the copy is on no day yet.')
            onOpen(copy.id)
          }}>
            <Copy size={14} /> Duplicate
          </Button>
          <Button variant="danger" block onClick={() => {
            if (confirm(`Delete “${live.title || 'this routine'}”?\n\n`
              + `${days.length ? `${daysSummary(days)} become unplanned. ` : ''}`
              + 'Days you already logged keep their history.')) {
              setRoutine(r => removeTemplate(r, id)); onClose(); onToast('Deleted.')
            }
          }}>
            Delete
          </Button>
        </div>
      )}
    </Sheet>
  )
}

/* ── Habits ──────────────────────────────────────────────────────────────── */

function HabitsTab({ routine, onEdit }) {
  const blank = () => ({ kind: 'habit', isNew: true, draft: blankHabit(routine) })

  return (
    <>
      <SectionHead
        title="Habits"
        sub={`${routine.habits.length}`}
        action={
          <button className="icon-btn" aria-label="Add a habit" onClick={() => onEdit(blank())}>
            <Plus size={18} />
          </button>
        }
      />
      <Card>
        {!routine.habits.length && <div className="block-empty">No habits yet. Add the first one.</div>}
        {routine.habits.map(h => {
          const cat = getCategory(routine, h.categoryId)
          const unused = isUnusedHabit(routine, h.id)
          return (
            <EditRow
              key={h.id}
              title={h.name}
              warn={unused}
              meta={
                <>
                  {cat && <span className="cat-chip" style={{ '--mood-color': cat.color }}>
                    <span className="mood-dot" />{cat.label}
                  </span>}
                  {h.time && <Tag tone="neutral"><Clock />{formatTime(h.time)}</Tag>}
                  {unused
                    ? <Tag tone="warn"><CalendarOff />On no day</Tag>
                    : <Tag tone="neutral">{daysSummary(habitDays(routine, h.id))}</Tag>}
                </>
              }
              onEdit={() => onEdit({ kind: 'habit', draft: { ...h } })}
            />
          )
        })}
      </Card>
    </>
  )
}

/* ── Categories ──────────────────────────────────────────────────────────── */

function CatsTab({ routine, onEdit }) {
  return (
    <>
      <SectionHead
        title="Categories"
        action={
          <button className="icon-btn" aria-label="Add a category"
                  onClick={() => onEdit({ kind: 'cat', isNew: true,
                    draft: { id: newId('cat'), label: '', color: PALETTE[routine.categories.length % PALETTE.length] } })}>
            <Plus size={18} />
          </button>
        }
      />
      <Card>
        {routine.categories.map(c => {
          const n = routine.habits.filter(h => h.categoryId === c.id).length
          return (
            <EditRow
              key={c.id}
              title={c.label}
              meta={<span className="cat-chip" style={{ '--mood-color': c.color }}>
                <span className="mood-dot" />{n} habit{n === 1 ? '' : 's'}
              </span>}
              onEdit={() => onEdit({ kind: 'cat', draft: { ...c } })}
            />
          )
        })}
      </Card>
    </>
  )
}

function CatSheet({ routine, setRoutine, editing, onClose, onToast }) {
  const isNew = !!editing.isNew
  const [d, setD] = useState(editing.draft)
  const last = routine.categories.length <= 1

  return (
    <Sheet title={isNew ? 'New category' : 'Edit category'} onClose={onClose}>
      <Field label="Name">
        <input value={d.label} onChange={e => setD({ ...d, label: e.target.value })}
               placeholder="Leisure" autoFocus={isNew} />
      </Field>
      <Field label="Colour" hint="Worn by every step in this category.">
        <ColorPicker value={d.color} onChange={c => setD({ ...d, color: c })} palette={PALETTE} />
      </Field>
      <Button block disabled={!d.label.trim()} onClick={() => {
        setRoutine(r => upsertCategory(r, { ...d, label: d.label.trim() })); onToast('Saved.'); onClose()
      }}>
        {isNew ? 'Add category' : 'Save'}
      </Button>
      {!isNew && !last && (
        <Button variant="danger" block style={{ marginTop: 'var(--sp-2)' }}
                onClick={() => {
                  if (confirm(`Delete “${d.label}”? Its habits move to ${routine.categories.find(c => c.id !== d.id)?.label}.`)) {
                    setRoutine(r => removeCategory(r, d.id)); onClose(); onToast('Deleted.')
                  }
                }}>
          Delete category
        </Button>
      )}
    </Sheet>
  )
}
