/* ============================================================================
   ROUTINE — the editor.
   ============================================================================
   Four tabs, because there are exactly four things to edit and they change at
   very different rates:

     WEEK        which day runs which routine, its ORDER, and the colour that
                 day wears. This is where you spend your time.
     ROUTINES    the named days themselves — create, rename, copy, delete.
                 Added in v3, when a routine stopped being reachable only
                 through a weekday that happened to run it.
     HABITS      the library of things you do. Edited when you start or stop
                 doing something.
     CATEGORIES  workout / supplement / skincare / leisure. Almost never.

   The week tab is the one that matters and it is first. Everything else exists
   to feed it.

   Every mutation goes through a pure helper from lib/routine.js handed to
   `setRoutine`, so this file never does list surgery.
   ========================================================================== */

import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronLeft, Plus, RotateCcw, Clock, Hourglass, CalendarOff,
  ChevronUp, ChevronDown, Trash2, X, Copy, Palette, BedDouble, Repeat2,
} from 'lucide-react'
import { PageHeader } from '../components/AppShell.jsx'
import {
  Card, SectionHead, Button, Tag, Chip, Field, Sheet, Toast, Segmented,
  DayPicker, ColorPicker, EditRow, Empty, Toggle, IconPicker,
} from '../components/UI.jsx'
import { useStore } from '../lib/store.jsx'
import { ICON_GROUPS, iconFor } from '../lib/icons.js'
import {
  newId, PALETTE, REST_COLOR, DAY_ORDER, DAY_LABELS, ALL_DAYS,
  templateForDay, daysForTemplate, resolveSteps, habitDays, isUnusedHabit,
  formatTime, formatWait, totalWaitMinutes, getCategory, getTemplate,
  habitCountIn, dayColorFor, setDayColor,
  upsertHabit, removeHabit, setHabitDays,
  upsertCategory, removeCategory,
  upsertTemplate, removeTemplate, renameTemplate, duplicateTemplate,
  setTemplateDays, assignDay,
  addHabitStep, addWaitStep, updateStep, removeStep, moveStep,
} from '../lib/routine.js'

/* FOUR TABS, which is the Segmented control's ceiling and not a coincidence:
   templates earned one because they gained a life of their own. A template used
   to be reachable only THROUGH a weekday that ran it, so one that sat on no day
   could be created and then never found again — the "Not in the week" list at
   the foot of the Week tab existed to paper over exactly that. With rename,
   duplicate and delete all belonging to the template rather than to the day, the
   list is the surface and the Week tab goes back to being about the week. */
const TABS = [
  { value: 'week', label: 'Week' },
  { value: 'tpls', label: 'Routines' },
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
  const [params, setParams] = useSearchParams()
  const { routine, setRoutine, resetRoutine } = useStore()
  const [tab, setTab] = useState('week')
  const [editing, setEditing] = useState(null)
  const [toast, setToast] = useState(null)

  const close = () => setEditing(null)
  const say = m => setToast(m)

  /* `?day=N` opens that weekday's builder straight away — this is what makes
     onboarding's "where do we start?" a real choice rather than a question with
     no consequence. The param is CONSUMED (stripped from the URL) so a reload,
     or a back-navigation later in the session, does not reopen a sheet the user
     already closed. */
  useEffect(() => {
    const raw = params.get('day')
    if (raw == null) return
    const d = Number(raw)
    setParams({}, { replace: true })
    if (!Number.isInteger(d) || d < 0 || d > 6) return
    const tpl = templateForDay(routine, d)
    setEditing(tpl
      ? { kind: 'template', draft: { ...tpl } }
      : {
          kind: 'template', isNew: true, days: [d],
          draft: { id: newId('tpl'), title: '', rest: false,
                   color: PALETTE[routine.templates.length % PALETTE.length], steps: [] },
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      {tab === 'tpls'   && <TemplatesTab routine={routine} setRoutine={setRoutine} onEdit={setEditing} onToast={say} />}
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
      {editing?.kind === 'dayColor' && (
        <DayColorSheet
          routine={routine} setRoutine={setRoutine} day={editing.day}
          onClose={close} onToast={say}
        />
      )}
      {editing?.kind === 'rename' && (
        <RenameSheet
          template={editing.template} setRoutine={setRoutine}
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
    draft: {
      id: newId('tpl'), title: '', rest: false,
      color: PALETTE[routine.templates.length % PALETTE.length], steps: [],
    },
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
          const color = dayColorFor(routine, d)
          const overridden = !!routine.weekColor?.[d]
          return (
            <div className="week-row" key={d}>
              <span className="week-day">{DAY_LABELS[d].slice(0, 3)}</span>
              {tpl ? (
                <button
                  className="week-slot"
                  style={{ '--mood-color': color }}
                  onClick={() => onEdit({ kind: 'template', draft: { ...tpl } })}
                >
                  <span className="mood-dot" />
                  <span className="grow">{tpl.title}</span>
                  {tpl.rest && <BedDouble size={14} aria-label="Rest day" />}
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
              {/* THE DAY'S COLOUR IS PICKED PER DAY, NOT PER ROUTINE, and this
                  button is why it had to be. Mon/Wed/Fri share one "Gym"; if
                  the colour lived only on the routine, recolouring Monday would
                  recolour Wednesday and Friday without saying so. The swatch
                  starts on the routine's colour and diverges only when tapped —
                  which is exactly "pre-fill from the template, allow override".
                  A rest day's colour is fixed and not offered. */}
              {tpl && !tpl.rest && (
                <button
                  className={`day-swatch${overridden ? ' is-custom' : ''}`}
                  style={{ '--mood-color': color }}
                  aria-label={`Colour for ${DAY_LABELS[d]}`}
                  title={overridden ? 'Custom colour — tap to change' : "Routine's colour — tap to change"}
                  onClick={() => onEdit({ kind: 'dayColor', day: d })}
                >
                  <Palette size={14} />
                </button>
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
          is called out here and LISTED on the Routines tab, which is the one
          place every routine appears whether or not a day runs it. */}
      {routine.templates.filter(t => daysForTemplate(routine, t.id).length === 0).length > 0 && (
        <p className="prose muted" style={{ fontSize: 'var(--fs-xs)' }}>
          {routine.templates.filter(t => daysForTemplate(routine, t.id).length === 0).length} routine(s)
          aren&rsquo;t on the week right now. They&rsquo;re on the <b>Routines</b> tab.
        </p>
      )}
    </>
  )
}

/* ── Routines — the template CRUD surface ────────────────────────────────────
   Create, rename, edit, duplicate, delete. All four verbs in one place, which
   is the point: before this tab a template could only be reached through a
   weekday that ran it, so one on no day was created and then unfindable, and
   "rename" meant opening the full day editor and retyping the title field.

   DELETING A ROUTINE DOES NOT TOUCH THE DAYS ALREADY LOGGED FROM IT. Completion
   is keyed by step id, each logged day stores its own denominator, and history
   is a record of what happened rather than a view of the current routine. The
   weekdays that ran it simply become unplanned. The confirm says so, because
   "will this eat my streak?" is the question that stops people tidying up. */

function TemplatesTab({ routine, setRoutine, onEdit, onToast }) {
  const blank = () => ({
    kind: 'template', isNew: true, days: [],
    draft: {
      id: newId('tpl'), title: '', rest: false,
      color: PALETTE[routine.templates.length % PALETTE.length], steps: [],
    },
  })

  return (
    <>
      <SectionHead
        title="Routines"
        sub={`${routine.templates.length}`}
        action={
          <button className="icon-btn" aria-label="Add a routine" onClick={() => onEdit(blank())}>
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
          const steps = t.steps.filter(s => s.kind === 'habit').length
          return (
            <EditRow
              key={t.id}
              title={t.title}
              warn={days.length === 0}
              meta={
                <>
                  <span className="cat-chip" style={{ '--mood-color': t.rest ? REST_COLOR : t.color }}>
                    <span className="mood-dot" />{steps} step{steps === 1 ? '' : 's'}
                  </span>
                  {t.rest && <Tag tone="neutral"><BedDouble />Rest</Tag>}
                  {days.length
                    ? <Tag tone="neutral">{daysSummary(days)}</Tag>
                    : <Tag tone="warn"><CalendarOff />On no day</Tag>}
                </>
              }
              onEdit={() => onEdit({ kind: 'template', draft: { ...t } })}
              onDelete={() => {
                if (confirm(`Delete “${t.title}”?\n\n`
                  + `${days.length ? `${daysSummary(days)} become unplanned. ` : ''}`
                  + 'Days you have already logged keep their history — this only '
                  + 'changes what happens from now on.')) {
                  setRoutine(r => removeTemplate(r, t.id)); onToast('Deleted.')
                }
              }}
            />
          )
        })}
      </Card>

      {/* Rename and duplicate are their own row rather than icons crammed into
          EditRow, which already carries edit / delete and is used on three
          tabs. Two verbs that belong only to templates do not get to widen a
          shared component. */}
      {routine.templates.length > 0 && (
        <Card>
          <div className="section-title">Quick actions</div>
          {routine.templates.map(t => (
            <div className="tpl-actions" key={t.id}>
              <span className="grow tpl-actions-name">{t.title}</span>
              <Button size="sm" variant="secondary"
                      onClick={() => onEdit({ kind: 'rename', template: t })}>
                Rename
              </Button>
              <Button size="sm" variant="secondary"
                      onClick={() => { setRoutine(r => duplicateTemplate(r, t.id)); onToast('Copied.') }}>
                <Copy size={13} /> Copy
              </Button>
            </div>
          ))}
        </Card>
      )}

      <p className="prose muted" style={{ fontSize: 'var(--fs-xs)' }}>
        A copy starts on no day and carries the same steps. It is the quickest
        way to split two weekdays that have been sharing one routine and now
        need to differ — copy it, then move one day onto the copy.
      </p>
    </>
  )
}

/** Rename on its own, because renaming is not editing. Opening a twenty-step
 *  sequence editor to change one word is the friction this removes. */
function RenameSheet({ template, setRoutine, onClose, onToast }) {
  const [title, setTitle] = useState(template.title)
  const save = () => {
    setRoutine(r => renameTemplate(r, template.id, title))
    onToast('Renamed.'); onClose()
  }
  return (
    <Sheet title="Rename routine" onClose={onClose}>
      <Field label="Name" hint="Every day running it shows this.">
        <input value={title} autoFocus maxLength={40}
               onChange={e => setTitle(e.target.value)}
               onKeyDown={e => { if (e.key === 'Enter' && title.trim()) save() }} />
      </Field>
      <Button block disabled={!title.trim()} onClick={save}>Save</Button>
    </Sheet>
  )
}

/** The per-day mood colour (§3.5). Starts on the routine's own colour and
 *  diverges only when something here is picked; "Use the routine's colour"
 *  clears the override rather than writing the same hex, so a later change to
 *  the routine still reaches the days that never chose for themselves. */
function DayColorSheet({ routine, setRoutine, day, onClose, onToast }) {
  const tpl = templateForDay(routine, day)
  const current = routine.weekColor?.[day] || null

  const pick = color => {
    setRoutine(r => setDayColor(r, day, color))
    onToast(color ? 'Colour set.' : "Back to the routine's colour.")
    onClose()
  }

  return (
    <Sheet title={`${DAY_LABELS[day]}'s colour`} onClose={onClose}>
      <Field
        label="Pick a colour"
        hint={tpl ? `${tpl.title} runs on ${daysSummary(daysForTemplate(routine, tpl.id))}. This colours ${DAY_LABELS[day]} only.` : undefined}
      >
        <ColorPicker value={current || tpl?.color} onChange={pick} palette={PALETTE} />
      </Field>
      <Button variant="secondary" block disabled={!current} onClick={() => pick(null)}>
        Use the routine&rsquo;s colour
      </Button>
    </Sheet>
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

      <Field label="Colour" hint={d.rest ? 'A rest day always shows the rest colour, so this is only used if you turn rest off.' : undefined}>
        <ColorPicker value={d.color} onChange={c => set({ color: c })} palette={PALETTE} />
      </Field>

      {/* REST IS A KIND OF DAY, NOT AN EMPTY ONE. A rest day can still hold a
          full skincare routine — what it means is "no work is scheduled", and
          the week strip needs that as a flag because it cannot be inferred from
          a step count. A nine-step rest day and a nine-step light gym day are
          the same number and completely different days. */}
      <Toggle
        checked={!!d.rest}
        onChange={on => set({ rest: on })}
        label="This is a rest day"
        hint="Shown in its own colour on the week strip, off the busy-ness scale."
      />

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
                    onClick={() => setAdding({ mode: 'edit-step', step: s })}
                  >
                    <span className="mood-dot" />
                    <span className="grow">{s.habit.name}</span>
                    {/* A habit may sit in this day more than once now, so a row
                        that is one of several says which — without it, four
                        identical "Glass of water" rows are indistinguishable
                        and the reorder arrows read as no-ops. */}
                    {habitCountIn(live, s.habitId) > 1 && (
                      <span className="seq-rep" title="Appears more than once in this day">
                        <Repeat2 size={12} />
                        {steps.filter(x => x.kind === 'habit' && x.habitId === s.habitId).indexOf(s) + 1}
                        /{habitCountIn(live, s.habitId)}
                      </span>
                    )}
                    {/* `s.time` is the RESOLVED time — the step's own override
                        if it set one, the habit's otherwise. Untimed is the
                        norm, so nothing is printed for it. */}
                    {s.time && (
                      <span className={`seq-time${s.time !== (s.habit.time || '') ? ' is-override' : ''}`}>
                        {formatTime(s.time)}
                      </span>
                    )}
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
            draft: { id: newId('habit'), name: '', detail: '', time: '', categoryId: routine.categories[0].id,
                     remind: null, warn: '', icon: '', duration: 0 } }) }}
          onClose={() => setAdding(null)}
        />
      )}
      {/* Stacked ON the day sheet rather than replacing it, so editing a step
          does not lose your place in a twenty-step sequence. Same trick the wait
          editor and the step picker already use. */}
      {adding?.mode === 'edit-step' && (
        <StepSheet
          routine={routine} setRoutine={setRoutine}
          templateId={d.id} step={adding.step}
          onEditHabit={() => setAdding({ mode: 'edit-habit', habitId: adding.step.habitId })}
          onClose={() => setAdding(null)}
          onToast={onToast}
        />
      )}
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

/* ── One step, inside one day ────────────────────────────────────────────────
   THE SHEET THAT SEPARATES "THIS OCCURRENCE" FROM "THIS HABIT", which is a
   distinction that did not exist until a habit could appear twice. Tapping a
   row used to open the habit editor directly, so changing when the EVENING
   cleanse happens changed the morning one too — the two were the same record.

   Everything here is about the step. The one button that leaves for the habit
   says so, and says how many days it would reach. */
function StepSheet({ routine, setRoutine, templateId, step, onEditHabit, onClose, onToast }) {
  const habit = step.habit
  const inherited = habit.time || ''
  const [override, setOverride] = useState(step.time != null)
  const [time, setTime] = useState(step.time != null ? step.time : (inherited || '08:00'))
  const Glyph = iconFor(habit, step.category)
  const usedIn = habitDays(routine, habit.id)

  const save = () => {
    setRoutine(r => updateStep(r, templateId, step.id, { time: override ? time : null }))
    onToast('Saved.'); onClose()
  }

  return (
    <Sheet title={habit.name} onClose={onClose}>
      <Card>
        <div className="row row-tight">
          <span className="row-icon" style={{ color: step.category?.color }}><Glyph size={18} /></span>
          <div className="grow">
            <b>{habit.name}</b>
            {habit.detail && <div className="muted">{habit.detail}</div>}
          </div>
          {habit.duration > 0 && <Tag tone="neutral"><Hourglass />{formatWait(habit.duration)}</Tag>}
        </div>
      </Card>

      {/* THE OVERRIDE IS PER STEP AND IT IS WHAT MADE THE LIBRARY DEDUPE
          LOSSLESS. One "LUMACA Cleanser" sits at 06:30 in the morning stack and
          22:00 in the evening one because these two steps each pinned their own
          time; before that, the only way to express it was two habits with the
          same name, which is exactly what the cleanup removed. */}
      <Toggle
        checked={override}
        onChange={on => setOverride(on)}
        label="Give this step its own time"
        hint={inherited
          ? `Otherwise it uses ${formatTime(inherited)} from the habit itself.`
          : 'The habit has no time, so this step has none either.'}
      >
        <Field label="At" hint="Only this occurrence. The habit is unchanged.">
          <input type="time" value={time} onChange={e => setTime(e.target.value)} />
        </Field>
      </Toggle>

      <Button block onClick={save}>Save step</Button>

      <Button variant="secondary" block style={{ marginTop: 'var(--sp-2)' }} onClick={onEditHabit}>
        Edit the habit itself
      </Button>
      <p className="prose muted" style={{ fontSize: 'var(--fs-xs)' }}>
        That changes it everywhere — it&rsquo;s currently on {usedIn.length
          ? daysSummary(usedIn) : 'no day'}.
      </p>

      <Button variant="danger" block onClick={() => {
        setRoutine(r => removeStep(r, templateId, step.id)); onToast('Removed.'); onClose()
      }}>
        Remove from this day
      </Button>
    </Sheet>
  )
}

/** Pick from the library, or peel off to create a new habit. */
function HabitPicker({ routine, templateId, onPick, onNew, onClose }) {
  const tpl = getTemplate(routine, templateId)

  /* NOTHING IS FILTERED OUT, and that is the change §3.1 asked for. This list
     used to hide every habit already in the day, which made "a glass of water,
     four times" impossible to express — you could add the first and then the
     library appeared to have lost it. A habit already here shows its count
     instead, so adding a second is a deliberate act rather than an accident. */
  return (
    <Sheet title="Add a step" onClose={onClose}>
      <Button block onClick={onNew}><Plus size={14} /> New habit</Button>

      {routine.habits.length > 0 && <SectionHead title="From your habits" />}
      <Card>
        {!routine.habits.length && <div className="block-empty">No habits yet.</div>}
        {routine.habits.map(h => {
          const cat = getCategory(routine, h.categoryId)
          const n = habitCountIn(tpl, h.id)
          const Glyph = iconFor(h, cat)
          return (
            <button className="seq-row seq-pick" key={h.id} onClick={() => onPick(h.id)}>
              <span className="seq-main" style={{ '--mood-color': cat?.color }}>
                <span className="row-icon"><Glyph size={15} /></span>
                <span className="grow">{h.name}</span>
                {n > 0 && (
                  <span className="seq-rep" title={`Already in this day ${n} time${n === 1 ? '' : 's'}`}>
                    <Repeat2 size={12} />{n}
                  </span>
                )}
                {h.time && <span className="seq-time">{formatTime(h.time)}</span>}
              </span>
              <Plus size={16} />
            </button>
          )
        })}
      </Card>
      <p className="prose muted" style={{ fontSize: 'var(--fs-xs)' }}>
        A step lands in the position its time implies, so you rarely have to
        reorder by hand. Adding one you already have puts it in the day a second
        time — that is how four glasses of water are four steps, and each gets
        ticked on its own.
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
    draft: { id: newId('habit'), name: '', detail: '', time: '', categoryId: routine.categories[0].id,
             remind: null, warn: '', icon: '', duration: 0 },
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
  /* Starts open only when there is already a glyph to see. A new habit gets the
     collapsed version, which keeps the name field and the category chips on the
     first screen of the sheet where they belong. */
  const [glyphOpen, setGlyphOpen] = useState(!!editing.draft.icon)
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

      {/* HOW LONG IT TAKES, not when it happens — the two get confused and they
          are unrelated. A duration is what the step costs you; a time is where
          it sits on the clock, which is the toggle further down and is rare.
          0 means "not measured" and is the default: the day's total is only
          worth showing when the numbers in it were actually chosen. */}
      <Field label="How long it takes" hint={d.duration > 0 ? formatWait(d.duration) : 'Optional — leave at 0 if it is not worth timing.'}>
        <div className="chip-row">
          {[0, 1, 2, 5, 10, 15, 30, 45, 60, 90].map(m => (
            <Chip key={m} active={m === (d.duration || 0)} onClick={() => set({ duration: m })}>
              {m === 0 ? '—' : `${m}m`}
            </Chip>
          ))}
        </div>
      </Field>

      {/* The glyph. Collapsed behind a toggle because most habits never get one
          and a sixty-icon grid open by default would push every field below it
          off the first screen of the sheet. */}
      <Toggle
        checked={glyphOpen}
        onChange={setGlyphOpen}
        label="Glyph"
        hint={d.icon ? `Currently ${d.icon}.` : 'Optional — falls back to a plain dot.'}
      >
        <IconPicker value={d.icon || ''} onChange={icon => set({ icon })} groups={ICON_GROUPS} />
      </Toggle>

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
