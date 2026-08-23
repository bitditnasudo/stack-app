/* ============================================================================
   STACK BUILDER — the shared pieces of "edit one day's sequence".
   ============================================================================
   TWO SCREENS BUILD A DAY AND THEY MUST NOT DISAGREE ABOUT HOW.

   `pages/Routine.jsx` edits a day you already have; `pages/BuildWeek.jsx` walks
   you through the seven of them on first run. Both need the same step list, the
   same picker, the same wait editor and the same habit sheet — and the moment
   there are two copies, one of them gets the next fix. This file is the copy.

   It is the same reason `lib/useToday.js` exists: Today and Home both need
   "what's on today", and deriving it twice is how two screens drift out of
   agreement. Same rule, different layer.

   WHAT LIVES HERE, AND WHAT DELIBERATELY DOES NOT
   Everything below is about ONE TEMPLATE'S SEQUENCE. The things that are about
   a template's identity — its name, its colour, which weekdays run it, deleting
   it — stay with the screen that owns them, because the two screens genuinely
   want them differently: the editor puts them in a sheet with a Save button,
   the builder puts them inline in a flow with a Next button.
   ========================================================================== */

import { useState } from 'react'
import { Plus, Hourglass, ChevronUp, ChevronDown, Trash2, Repeat2 } from 'lucide-react'
import {
  Card, SectionHead, Button, Tag, Chip, Field, Sheet, DayPicker, Toggle, IconPicker,
} from './UI.jsx'
import { ICON_GROUPS, iconFor } from '../lib/icons.js'
import {
  newId, DAY_ORDER, DAY_LABELS, ALL_DAYS,
  templateForDay, resolveSteps, habitDays, habitCountIn,
  formatTime, formatWait, getCategory, getTemplate,
  upsertHabit, removeHabit, setHabitDays,
  addHabitStep, addWaitStep, updateStep, removeStep, moveStep,
} from '../lib/routine.js'

/** "Mon Wed Fri", "Every day", "No days". Shared because three components print
 *  it and three spellings of the same list is how a UI starts lying. */
export const daysSummary = days => {
  if (!days.length) return 'No days'
  if (days.length === 7) return 'Every day'
  return DAY_ORDER.filter(d => days.includes(d)).map(d => DAY_LABELS[d].slice(0, 3)).join(' ')
}

/** A fresh, empty habit draft. One definition, because three call sites open
 *  this sheet and a missing field on one of them is a habit that validates
 *  differently depending on where it was created. */
export const blankHabit = routine => ({
  id: newId('habit'), name: '', detail: '', time: '',
  categoryId: routine.categories[0].id, remind: null, warn: '', icon: '', duration: 0,
})

/* ============================================================================
   SEQUENCE EDITOR — the ordered list of steps, and everything that edits one.
   ============================================================================
   Owns its own sheet state, so a screen embeds it and does not have to know
   that tapping a step opens a sheet at all.

   `ensureExists` is for the one caller that needs it: the routine editor lets
   you build a brand-new template inside a sheet before it has been saved, and
   every step helper addresses a template by id, so it has to exist in the
   document first. The builder creates the template up front and passes nothing.
   ========================================================================== */

export function SequenceEditor({ routine, setRoutine, templateId, onToast, ensureExists }) {
  const [adding, setAdding] = useState(null)

  const live = getTemplate(routine, templateId)
  const steps = live ? resolveSteps(routine, live) : []

  const ready = () => { ensureExists?.() }

  if (!live && !ensureExists) return null

  return (
    <>
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
                            onClick={() => setRoutine(r => moveStep(r, templateId, s.id, -1))}>
                      <ChevronUp size={16} />
                    </button>
                  )}
                  {i < steps.length - 1 && (
                    <button className="icon-btn icon-btn-sm" aria-label="Move down"
                            onClick={() => setRoutine(r => moveStep(r, templateId, s.id, 1))}>
                      <ChevronDown size={16} />
                    </button>
                  )}
                  <button className="icon-btn icon-btn-sm icon-btn-danger" aria-label="Remove step"
                          onClick={() => setRoutine(r => removeStep(r, templateId, s.id))}>
                    <Trash2 size={16} />
                  </button>
                </span>
              </div>
            ))}
          </Card>

          {/* The two add buttons, side by side and in the day they belong to
              rather than in a global header. */}
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

      {adding?.mode === 'habit' && (
        <HabitPicker
          routine={routine} templateId={templateId}
          onPick={habitId => { ready(); setRoutine(r => addHabitStep(r, templateId, habitId)); setAdding(null) }}
          /* STACKED, NOT SWAPPED. This used to close the whole day sheet and
             reopen as a habit sheet, which lost your place in a twenty-step
             sequence — and could not work at all inside the builder, where
             there is no parent sheet to close. Stacking is what every other
             sheet here already does. */
          onNew={() => { ready(); setAdding({ mode: 'new-habit' }) }}
          onClose={() => setAdding(null)}
        />
      )}

      {adding?.mode === 'new-habit' && (
        <HabitSheet
          routine={routine} setRoutine={setRoutine}
          editing={{ isNew: true, intoTemplate: templateId, draft: blankHabit(routine) }}
          onClose={() => setAdding(null)}
          onToast={onToast}
        />
      )}

      {/* Stacked ON whatever opened it, so editing a step does not lose your
          place. Same trick the wait editor and the step picker use. */}
      {adding?.mode === 'edit-step' && (
        <StepSheet
          routine={routine} setRoutine={setRoutine}
          templateId={templateId} step={adding.step}
          onEditHabit={() => setAdding({ mode: 'edit-habit', habitId: adding.step.habitId })}
          onClose={() => setAdding(null)}
          onToast={onToast}
        />
      )}

      {adding?.mode === 'edit-habit' && (
        <HabitSheet
          routine={routine} setRoutine={setRoutine}
          editing={{ draft: { ...routine.habits.find(h => h.id === adding.habitId) } }}
          onClose={() => setAdding(null)}
          onToast={onToast}
        />
      )}

      {(adding?.mode === 'wait' || adding?.mode === 'edit-wait') && (
        <WaitSheet
          step={adding.step}
          onSave={({ minutes, note }) => {
            ready()
            if (adding.step) setRoutine(r => updateStep(r, templateId, adding.step.id, { minutes, note }))
            else setRoutine(r => addWaitStep(r, templateId, minutes, note))
            setAdding(null)
          }}
          onDelete={adding.step ? () => { setRoutine(r => removeStep(r, templateId, adding.step.id)); setAdding(null) } : null}
          onClose={() => setAdding(null)}
        />
      )}
    </>
  )
}

/* ── One step, inside one day ────────────────────────────────────────────────
   THE SHEET THAT SEPARATES "THIS OCCURRENCE" FROM "THIS HABIT", which is a
   distinction that did not exist until a habit could appear twice. Tapping a
   row used to open the habit editor directly, so changing when the EVENING
   cleanse happens changed the morning one too — the two were the same record.

   Everything here is about the step. The one button that leaves for the habit
   says so, and says how many days it would reach. */
export function StepSheet({ routine, setRoutine, templateId, step, onEditHabit, onClose, onToast }) {
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
export function HabitPicker({ routine, templateId, onPick, onNew, onClose }) {
  const tpl = getTemplate(routine, templateId)

  /* NOTHING IS FILTERED OUT. This list used to hide every habit already in the
     day, which made "a glass of water, four times" impossible to express — you
     could add the first and then the library appeared to have lost it. A habit
     already here shows its count instead, so adding a second is a deliberate
     act rather than an accident. */
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

export function WaitSheet({ step, onSave, onDelete, onClose }) {
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

/* ── The habit itself ────────────────────────────────────────────────────────
   The library record, edited from wherever you found it. `intoTemplate` is what
   distinguishes "I am creating this INSIDE a day" from "I am adding to the
   library": the first drops it into that day's sequence and hides the day
   picker entirely, because you already answered that question by being there. */
export function HabitSheet({ routine, setRoutine, editing, onClose, onToast }) {
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
