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
  ChevronLeft, Plus, RotateCcw, Clock, CalendarOff, Copy, Palette, BedDouble,
} from 'lucide-react'
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
  newId, PALETTE, REST_COLOR, DAY_ORDER, DAY_LABELS,
  templateForDay, daysForTemplate, resolveSteps, habitDays, isUnusedHabit,
  formatTime, formatWait, totalWaitMinutes, getCategory,
  dayColorFor, setDayColor,
  upsertCategory, removeCategory,
  upsertTemplate, removeTemplate, renameTemplate, duplicateTemplate,
  setTemplateDays,
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

function TemplateSheet({ routine, setRoutine, editing, onClose, onToast }) {
  const isNew = !!editing.isNew
  const [d, setD] = useState(editing.draft)
  const [days, setDays] = useState(
    isNew ? (editing.days || []) : daysForTemplate(routine, editing.draft.id))

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
        hint={days.length > 1
          ? `Applies to the whole routine — ${daysSummary(days)} all become rest days.`
          : 'Shown in its own colour on the week strip, off the busy-ness scale.'}
      />

      <Field
        label="Which days run it"
        hint={days.length ? daysSummary(days) : 'Not on the week yet — it will sit under “Not in the week”.'}
      >
        <DayPicker value={days} onChange={setDays} />
      </Field>

      <SectionHead
        title="The sequence"
        sub={steps.length
          ? `${steps.filter(s => s.kind === 'habit').length} habit`
            + `${steps.filter(s => s.kind === 'habit').length === 1 ? '' : 's'}`
            + ` · ${formatWait(totalWaitMinutes(steps))} waiting`
          : undefined}
      />

      <SequenceEditor
        routine={routine} setRoutine={setRoutine}
        templateId={d.id} onToast={onToast}
        ensureExists={ensureExists}
      />

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
