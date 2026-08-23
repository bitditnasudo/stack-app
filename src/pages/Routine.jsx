/* ============================================================================
   ROUTINE — the editor.
   ============================================================================
   Three tabs, because there are exactly three things to edit and they change at
   different rates:

     WEEK        which day runs which routine, and the ORDER of its steps.
                 This is where you spend your time.
     HABITS      the library of things you do. Edited when you start or stop
                 doing something.
     CATEGORIES  workout / supplement / skincare / leisure. Almost never.

   The week tab is the one that matters and it is first. Everything else exists
   to feed it.

   Every mutation goes through a pure helper from lib/routine.js handed to
   `setRoutine`, so this file never does list surgery.
   ========================================================================== */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Plus, RotateCcw, Clock, Hourglass, CalendarOff,
  ChevronUp, ChevronDown, Trash2, X,
} from 'lucide-react'
import { PageHeader } from '../components/AppShell.jsx'
import {
  Card, SectionHead, Button, Tag, Chip, Field, Sheet, Toast, Segmented,
  DayPicker, ColorPicker, EditRow, Empty, Toggle,
} from '../components/UI.jsx'
import { useStore } from '../lib/store.jsx'
import {
  newId, PALETTE, DAY_ORDER, DAY_LABELS, ALL_DAYS,
  templateForDay, daysForTemplate, resolveSteps, habitDays, isUnusedHabit,
  formatTime, formatWait, totalWaitMinutes, getCategory,
  upsertHabit, removeHabit, setHabitDays,
  upsertCategory, removeCategory,
  upsertTemplate, removeTemplate, setTemplateDays, assignDay,
  addHabitStep, addWaitStep, updateStep, removeStep, moveStep,
} from '../lib/routine.js'

const TABS = [
  { value: 'week', label: 'Week' },
  { value: 'habits', label: 'Habits' },
  { value: 'cats', label: 'Categories' },
]

const daysSummary = days => {
  if (!days.length) return 'No days'
  if (days.length === 7) return 'Every day'
  return DAY_ORDER.filter(d => days.includes(d)).map(d => DAY_LABELS[d].slice(0, 3)).join(' ')
}

export default function Routine() {
  const navigate = useNavigate()
  const { routine, setRoutine, resetRoutine } = useStore()
  const [tab, setTab] = useState('week')
  const [editing, setEditing] = useState(null)
  const [toast, setToast] = useState(null)

  const close = () => setEditing(null)
  const say = m => setToast(m)

  return (
    <div className="main-content">
      <PageHeader
        avatar={<ChevronLeft size={20} />}
        onAvatarClick={() => navigate(-1)}
        eyebrow="Your week"
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

      {tab === 'week'   && <WeekTab   routine={routine} setRoutine={setRoutine} onEdit={setEditing} />}
      {tab === 'habits' && <HabitsTab routine={routine} onEdit={setEditing} />}
      {tab === 'cats'   && <CatsTab   routine={routine} onEdit={setEditing} />}

      {editing?.kind === 'template' && (
        <TemplateSheet
          routine={routine} setRoutine={setRoutine} editing={editing}
          onClose={close} onToast={say} onEdit={setEditing}
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
   Seven weekdays, Monday first, each showing the routine it runs. Tapping one
   opens that routine — which is shared, so the row says how many other days it
   also covers. Editing Monday when Monday and Wednesday both run "Gym" edits
   Wednesday too, and the only honest place to say so is right here. */

function WeekTab({ routine, setRoutine, onEdit }) {
  const newTemplate = days => ({
    kind: 'template',
    isNew: true,
    days,
    draft: { id: newId('tpl'), title: '', color: PALETTE[routine.templates.length % PALETTE.length], steps: [] },
  })

  return (
    <>
      <SectionHead
        title="The week"
        action={
          <button className="icon-btn" aria-label="Add a routine"
                  onClick={() => onEdit(newTemplate([]))}>
            <Plus size={18} />
          </button>
        }
      />
      <Card>
        {DAY_ORDER.map(d => {
          const tpl = templateForDay(routine, d)
          const shared = tpl ? daysForTemplate(routine, tpl.id) : []
          return (
            <div className="week-row" key={d}>
              <span className="week-day">{DAY_LABELS[d].slice(0, 3)}</span>
              {tpl ? (
                <button
                  className="week-slot"
                  style={{ '--mood-color': tpl.color }}
                  onClick={() => onEdit({ kind: 'template', draft: { ...tpl } })}
                >
                  <span className="mood-dot" />
                  <span className="grow">{tpl.title}</span>
                  <span className="week-count">
                    {resolveSteps(routine, tpl).filter(s => s.kind === 'habit').length}
                  </span>
                </button>
              ) : (
                <button className="week-slot is-empty" onClick={() => onEdit(newTemplate([d]))}>
                  <span className="grow">Not planned — tap to build</span>
                  <Plus size={15} />
                </button>
              )}
              {tpl && shared.length > 1 && (
                <span className="week-shared" title={`Shared with ${daysSummary(shared)}`}>×{shared.length}</span>
              )}
            </div>
          )
        })}
      </Card>

      <p className="prose muted" style={{ fontSize: 'var(--fs-xs)' }}>
        Days that run the same routine share it — the <b>×2</b> marks how many.
        Editing one edits all of them, which is the point: build <b>Gym</b> once,
        put it on Monday, Wednesday and Friday. A day that needs to differ needs
        its own routine.
      </p>

      {/* A routine no weekday runs is not an error — it is one you built ahead
          or took off the week — but it is invisible from the rows above, so it
          gets its own list rather than silently disappearing. */}
      {routine.templates.filter(t => daysForTemplate(routine, t.id).length === 0).length > 0 && (
        <>
          <SectionHead title="Not in the week" />
          <Card>
            {routine.templates.filter(t => daysForTemplate(routine, t.id).length === 0).map(t => (
              <EditRow
                key={t.id}
                title={t.title}
                sub={`${t.steps.filter(s => s.kind === 'habit').length} habits · no day assigned`}
                warn
                onEdit={() => onEdit({ kind: 'template', draft: { ...t } })}
                onDelete={() => { if (confirm(`Delete “${t.title}”?`)) setRoutine(r => removeTemplate(r, t.id)) }}
              />
            ))}
          </Card>
        </>
      )}
    </>
  )
}

/* ── The day editor ──────────────────────────────────────────────────────────
   Title, colour, which weekdays, and the sequence. The sequence is the reason
   this screen exists, so it gets the most room and both add buttons sit with
   it rather than in a header somewhere. */

function TemplateSheet({ routine, setRoutine, editing, onClose, onToast, onEdit }) {
  const isNew = !!editing.isNew
  const [d, setD] = useState(editing.draft)
  const [days, setDays] = useState(
    isNew ? (editing.days || []) : daysForTemplate(routine, editing.draft.id))
  const [adding, setAdding] = useState(null)   // 'habit' | 'wait'

  const live = routine.templates.find(t => t.id === d.id)
  const steps = live ? resolveSteps(routine, live) : []
  const set = patch => setD(prev => ({ ...prev, ...patch }))

  /* A new routine is committed before its steps can be added — the step
     helpers all address a template by id, so it has to exist first. Saving
     twice is invisible to the user and keeps every mutation going through the
     same pure helpers. */
  const commit = () => {
    setRoutine(r => setTemplateDays(upsertTemplate(r, { ...d, title: d.title.trim() }), d.id, days))
  }

  const ensureExists = () => {
    if (!live) setRoutine(r => setTemplateDays(upsertTemplate(r, { ...d, title: d.title.trim() || 'Untitled' }), d.id, days))
  }

  return (
    <Sheet title={isNew ? 'New routine' : d.title || 'Routine'} onClose={onClose}>
      <Field label="Name it" hint="The mood of the day — “Gym”, “Slow Sunday”, “Deload”.">
        <input value={d.title} onChange={e => set({ title: e.target.value })}
               placeholder="Gym" autoFocus={isNew} />
      </Field>

      <Field label="Colour">
        <ColorPicker value={d.color} onChange={c => set({ color: c })} palette={PALETTE} />
      </Field>

      <Field
        label="Which days run it"
        hint={days.length ? daysSummary(days) : 'Not on the week yet — it will sit under “Not in the week”.'}
      >
        <DayPicker value={days} onChange={setDays} />
      </Field>

      <SectionHead
        title="The sequence"
        sub={steps.length ? `${steps.filter(s => s.kind === 'habit').length} habits · ${formatWait(totalWaitMinutes(steps))} waiting` : undefined}
      />

      {!live && (
        <p className="prose muted" style={{ fontSize: 'var(--fs-xs)' }}>
          Give it a name and save, then add the steps.
        </p>
      )}

      {live && (
        <>
          <Card>
            {!steps.length && <div className="block-empty">Empty. Add the first step below.</div>}
            {steps.map((s, i) => (
              <div className="seq-row" key={s.id}>
                {s.kind === 'wait' ? (
                  <button className="seq-main is-wait" onClick={() => setAdding({ mode: 'edit-wait', step: s })}>
                    <Hourglass size={14} />
                    <span className="grow">{formatWait(s.minutes)}{s.note ? ` — ${s.note}` : ''}</span>
                  </button>
                ) : (
                  /* A BUTTON, like the wait beside it. It shipped as a <span>,
                     which made this screen reorder-only: the wait rows opened an
                     editor on tap and the habit rows did nothing, so changing a
                     habit's time meant leaving the day, finding it on the Habits
                     tab and coming back. Two rows of one list behaving
                     differently is the bug; the missing editor is the symptom. */
                  <button
                    className="seq-main is-habit"
                    style={{ '--mood-color': s.category?.color }}
                    onClick={() => setAdding({ mode: 'edit-habit', habitId: s.habitId })}
                  >
                    <span className="mood-dot" />
                    <span className="grow">{s.habit.name}</span>
                    {/* Only scheduled habits show a time. Untimed is the norm
                        now, so the "no time" label this briefly had would have
                        been noise on twelve rows out of fifteen. */}
                    {s.habit.time && <span className="seq-time">{formatTime(s.habit.time)}</span>}
                  </button>
                )}
                <span className="seq-actions">
                  {i > 0 && (
                    <button className="icon-btn icon-btn-sm" aria-label="Move up"
                            onClick={() => setRoutine(r => moveStep(r, d.id, s.id, -1))}>
                      <ChevronUp size={16} />
                    </button>
                  )}
                  {i < steps.length - 1 && (
                    <button className="icon-btn icon-btn-sm" aria-label="Move down"
                            onClick={() => setRoutine(r => moveStep(r, d.id, s.id, 1))}>
                      <ChevronDown size={16} />
                    </button>
                  )}
                  <button className="icon-btn icon-btn-sm icon-btn-danger" aria-label="Remove step"
                          onClick={() => setRoutine(r => removeStep(r, d.id, s.id))}>
                    <Trash2 size={16} />
                  </button>
                </span>
              </div>
            ))}
          </Card>

          {/* The two add buttons the flow asks for, side by side and in the day
              they belong to rather than in a global header. */}
          <div className="field-row">
            <Button variant="secondary" block onClick={() => setAdding({ mode: 'habit' })}>
              <Plus size={14} /> Step
            </Button>
            <Button variant="secondary" block onClick={() => setAdding({ mode: 'wait' })}>
              <Hourglass size={14} /> Wait
            </Button>
          </div>
        </>
      )}

      <Button block disabled={!d.title.trim()} onClick={() => {
        commit(); onToast('Saved.'); if (isNew) onClose()
      }} style={{ marginTop: 'var(--sp-4)' }}>
        {isNew ? 'Create routine' : 'Save'}
      </Button>

      {!isNew && (
        <Button variant="danger" block style={{ marginTop: 'var(--sp-2)' }}
                onClick={() => {
                  if (confirm(`Delete “${d.title}”? The days running it become unplanned.`)) {
                    setRoutine(r => removeTemplate(r, d.id)); onClose(); onToast('Deleted.')
                  }
                }}>
          Delete routine
        </Button>
      )}

      {adding?.mode === 'habit' && (
        <HabitPicker
          routine={routine} templateId={d.id}
          onPick={habitId => { ensureExists(); setRoutine(r => addHabitStep(r, d.id, habitId)); setAdding(null) }}
          onNew={() => { setAdding(null); onClose(); onEdit({ kind: 'habit', isNew: true, intoTemplate: d.id,
            draft: { id: newId('habit'), name: '', detail: '', time: '', categoryId: routine.categories[0].id, remind: null, warn: '' } }) }}
          onClose={() => setAdding(null)}
        />
      )}
      {/* Stacked ON the day sheet rather than replacing it, so editing a habit
          does not lose your place in a twenty-step sequence. Same trick the wait
          editor and the step picker already use. */}
      {adding?.mode === 'edit-habit' && (
        <HabitSheet
          routine={routine}
          setRoutine={setRoutine}
          editing={{ draft: { ...routine.habits.find(h => h.id === adding.habitId) } }}
          onClose={() => setAdding(null)}
          onToast={onToast}
        />
      )}
      {(adding?.mode === 'wait' || adding?.mode === 'edit-wait') && (
        <WaitSheet
          step={adding.step}
          onSave={({ minutes, note }) => {
            if (adding.step) setRoutine(r => updateStep(r, d.id, adding.step.id, { minutes, note }))
            else setRoutine(r => addWaitStep(r, d.id, minutes, note))
            setAdding(null)
          }}
          onDelete={adding.step ? () => { setRoutine(r => removeStep(r, d.id, adding.step.id)); setAdding(null) } : null}
          onClose={() => setAdding(null)}
        />
      )}
    </Sheet>
  )
}

/** Pick from the library, or peel off to create a new habit. */
function HabitPicker({ routine, templateId, onPick, onNew, onClose }) {
  const tpl = routine.templates.find(t => t.id === templateId)
  const already = new Set((tpl?.steps || []).filter(s => s.kind === 'habit').map(s => s.habitId))
  const available = routine.habits.filter(h => !already.has(h.id))

  return (
    <Sheet title="Add a step" onClose={onClose}>
      <Button block onClick={onNew}><Plus size={14} /> New habit</Button>

      {available.length > 0 && <SectionHead title="From your habits" />}
      <Card>
        {!available.length && (
          <div className="block-empty">
            {routine.habits.length ? 'Every habit is already in this day.' : 'No habits yet.'}
          </div>
        )}
        {available.map(h => {
          const cat = getCategory(routine, h.categoryId)
          return (
            <button className="seq-row seq-pick" key={h.id} onClick={() => onPick(h.id)}>
              <span className="seq-main" style={{ '--mood-color': cat?.color }}>
                <span className="mood-dot" />
                <span className="grow">{h.name}</span>
                {h.time && <span className="seq-time">{formatTime(h.time)}</span>}
              </span>
              <Plus size={16} />
            </button>
          )
        })}
      </Card>
      <p className="prose muted" style={{ fontSize: 'var(--fs-xs)' }}>
        A step lands in the position its time implies, so you rarely have to
        reorder by hand.
      </p>
    </Sheet>
  )
}

const WAIT_PRESETS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60]

function WaitSheet({ step, onSave, onDelete, onClose }) {
  const [minutes, setMinutes] = useState(step?.minutes ?? 10)
  const [note, setNote] = useState(step?.note ?? '')

  return (
    <Sheet title={step ? 'Edit wait' : 'Add a wait'} onClose={onClose}>
      <Field label="How long" hint={formatWait(minutes)}>
        <div className="chip-row">
          {WAIT_PRESETS.map(m => (
            <Chip key={m} active={m === minutes} onClick={() => setMinutes(m)}>{m}m</Chip>
          ))}
        </div>
      </Field>
      <Field label="Or exactly">
        <input type="number" min="0" max="1440" value={minutes}
               onChange={e => setMinutes(Math.max(0, Math.min(1440, Number(e.target.value) || 0)))} />
      </Field>
      <Field label="What for" hint="Optional — shown on the day.">
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Bone-dry before retinol" />
      </Field>
      <Button block onClick={() => onSave({ minutes, note: note.trim() })}>
        {step ? 'Save wait' : 'Add wait'}
      </Button>
      {onDelete && (
        <Button variant="danger" block style={{ marginTop: 'var(--sp-2)' }} onClick={onDelete}>
          Remove wait
        </Button>
      )}
    </Sheet>
  )
}

/* ── Habits ──────────────────────────────────────────────────────────────── */

function HabitsTab({ routine, onEdit }) {
  const blank = () => ({
    kind: 'habit', isNew: true,
    draft: { id: newId('habit'), name: '', detail: '', time: '', categoryId: routine.categories[0].id, remind: null, warn: '' },
  })

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
          const days = habitDays(routine, h.id)
          const unused = isUnusedHabit(routine, h.id)
          return (
            <EditRow
              key={h.id}
              title={h.name}
              warn={unused}
              meta={
                <>
                  {h.time && <Tag tone="neutral"><Clock />{formatTime(h.time)}</Tag>}
                  {unused
                    ? <Tag tone="warn"><CalendarOff />In no day yet</Tag>
                    : <Tag tone="neutral">{daysSummary(days)}</Tag>}
                  {cat && <span className="cat-chip" style={{ '--mood-color': cat.color }}>
                    <span className="mood-dot" />{cat.label}
                  </span>}
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

function HabitSheet({ routine, setRoutine, editing, onClose, onToast }) {
  const isNew = !!editing.isNew
  const [d, setD] = useState(editing.draft)
  const [days, setDays] = useState(isNew ? [] : habitDays(routine, editing.draft.id))
  /* Remembered so toggling the switch off and straight back on does not silently
     discard the time you already typed. Local only — never stored. */
  const [lastTime, setLastTime] = useState(editing.draft.time || '08:00')
  const set = patch => setD(prev => ({ ...prev, ...patch }))

  /* Which weekdays could this habit even reach? Only ones with a routine
     assigned — you cannot put a habit on a day that has no day. */
  const plannedDays = ALL_DAYS.filter(x => !!templateForDay(routine, x))
  const asked = new Set(days)
  const willAlsoGet = ALL_DAYS.filter(x => {
    if (asked.has(x)) return false
    const t = templateForDay(routine, x)
    return !!t && days.some(y => routine.week[y] === t.id)
  })

  const save = () => {
    setRoutine(r => {
      let next = upsertHabit(r, { ...d, name: d.name.trim() })
      if (editing.intoTemplate) next = addHabitStep(next, editing.intoTemplate, d.id)
      else next = setHabitDays(next, d.id, days)
      return next
    })
    onToast('Saved.')
    onClose()
  }

  return (
    <Sheet title={isNew ? 'New habit' : 'Edit habit'} onClose={onClose}>
      <Field label="What is it">
        <input value={d.name} onChange={e => set({ name: e.target.value })}
               placeholder="Creatine" autoFocus={isNew} />
      </Field>

      <Field label="Category">
        <div className="chip-row">
          {routine.categories.map(c => (
            <button
              key={c.id}
              className={`cat-choice${c.id === d.categoryId ? ' is-active' : ''}`}
              style={{ '--mood-color': c.color }}
              onClick={() => set({ categoryId: c.id })}
              aria-pressed={c.id === d.categoryId}
            >
              <span className="mood-dot" />{c.label}
            </button>
          ))}
        </div>
      </Field>

      {/* MOST HABITS HAVE NO TIME, and that is the default.
          STACK is a stack: a pile you work through in the order you arranged,
          not a timetable. Pinning every habit to a clock made a fifteen-step
          skincare routine look like fifteen appointments, and it is not — it is
          one sitting. A time is for the few things that genuinely are
          clock-bound (sleep, a class, the gym), so it is opt-in.

          There is no `scheduled` field: a habit is scheduled exactly when it has
          a time. Storing a boolean beside the string would let the two disagree,
          and then something has to decide which one is lying. */}
      <Toggle
        checked={!!d.time}
        onChange={on => set(on ? { time: lastTime } : { time: '', remind: null })}
        label="Happens at a set time"
        hint="Leave off for anything you just work through during the day."
      >
        <div className="field-row">
          <Field label="At">
            <input
              type="time"
              value={d.time}
              onChange={e => { setLastTime(e.target.value || '08:00'); set({ time: e.target.value }) }}
            />
          </Field>
          <Field label="Remind me">
            <select
              value={d.remind == null ? '' : String(d.remind)}
              onChange={e => set({ remind: e.target.value === '' ? null : Number(e.target.value) })}
            >
              <option value="">No</option>
              <option value="0">On time</option>
              <option value="5">5 min before</option>
              <option value="10">10 min before</option>
              <option value="30">30 min before</option>
            </select>
          </Field>
        </div>
      </Toggle>

      {!editing.intoTemplate && (
        <Field
          label="Which days"
          hint={plannedDays.length ? undefined : 'No days are planned yet — build a day first, on the Week tab.'}
        >
          <DayPicker value={days} onChange={setDays} />
          {willAlsoGet.length > 0 && (
            <div className="hint" style={{ color: 'var(--warn-ink)' }}>
              Also lands on {daysSummary(willAlsoGet)} — those days share a
              routine with the ones you picked. Split them into their own routine
              on the Week tab if they need to differ.
            </div>
          )}
        </Field>
      )}

      <Field label="What to do" hint="Optional — the line under the name.">
        <textarea rows={2} value={d.detail} onChange={e => set({ detail: e.target.value })}
                  placeholder="3–5g — take right after workout" />
      </Field>

      <Field label="Warning" hint="Optional. Keep it for real contraindications.">
        <input value={d.warn} onChange={e => set({ warn: e.target.value })}
               placeholder="Never layer with Vitamin C" />
      </Field>

      <Button block disabled={!d.name.trim()} onClick={save}>
        {isNew ? 'Add habit' : 'Save'}
      </Button>
      {!isNew && (
        <Button variant="danger" block style={{ marginTop: 'var(--sp-2)' }}
                onClick={() => {
                  if (confirm(`Delete “${d.name}”? It comes out of every day that uses it. Your logged history stays.`)) {
                    setRoutine(r => removeHabit(r, d.id)); onClose(); onToast('Deleted.')
                  }
                }}>
          Delete habit
        </Button>
      )}
    </Sheet>
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
              sub={`${n} habit${n === 1 ? '' : 's'}`}
              meta={<span className="cat-chip" style={{ '--mood-color': c.color }}>
                <span className="mood-dot" />{c.label}
              </span>}
              onEdit={() => onEdit({ kind: 'cat', draft: { ...c } })}
            />
          )
        })}
      </Card>
      <p className="prose muted" style={{ fontSize: 'var(--fs-xs)' }}>
        A category&rsquo;s colour is what its steps wear on the day screen, and
        what Overview splits by. Deleting one moves its habits to the first
        category rather than deleting them.
      </p>
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
