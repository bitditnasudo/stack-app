/* ============================================================================
   ROUTINE — the editor. Where the protocol stopped being code.
   ============================================================================
   Four things are editable, and they are separated because they are edited at
   different rates: TASKS change weekly, DAY TYPES and BLOCKS change when the
   shape of the week changes (twice a year), TAGS almost never. A single scroll
   holding all four would bury the one you came for under the three you didn't.

   Why a sub-page and not a fifth tab: the nav bar is full at four, and the kit
   drops inactive labels to icons at exactly that count — a fifth would overflow
   at 375px. This is reached from the pencil on Today (where you notice a step
   is missing) and from Settings (where you go looking for it).

   Every mutation goes through a pure helper from lib/routine.js handed to
   `setRoutine`, so this file never does list surgery and the store is the only
   thing that knows about persistence.
   ========================================================================== */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, RotateCcw, Clock, Hourglass, CalendarOff } from 'lucide-react'
import { PageHeader } from '../components/AppShell.jsx'
import {
  Card, SectionHead, Button, Tag, Chip, Field, Sheet, Toast, Segmented,
  DayPicker, TonePicker, EditRow,
} from '../components/UI.jsx'
import { useStore } from '../lib/store.jsx'
import {
  newId, taskDays, isUnscheduled, formatTimeRange, formatTime,
  upsertTask, removeTask, moveTask,
  upsertDayType, removeDayType, moveDayType,
  upsertTag, removeTag,
  upsertBlock, removeBlock, moveBlock,
  DAY_ORDER, DAY_LABELS,
} from '../lib/routine.js'

const TABS = [
  { value: 'tasks',  label: 'Tasks' },
  { value: 'days',   label: 'Days' },
  { value: 'tags',   label: 'Tags' },
  { value: 'blocks', label: 'Blocks' },
]

/** "Mon Wed Fri", or "Every day" once all seven are on. */
function daysSummary(days) {
  if (!days.length) return 'No days'
  if (days.length === 7) return 'Every day'
  return DAY_ORDER.filter(d => days.includes(d)).map(d => DAY_LABELS[d].slice(0, 3)).join(' ')
}

export default function Routine() {
  const navigate = useNavigate()
  const { routine, setRoutine, resetRoutine } = useStore()
  const [tab, setTab] = useState('tasks')
  const [editing, setEditing] = useState(null)   // { kind: 'task'|'dayType'|'tag'|'block', draft }
  const [toast, setToast] = useState(null)

  const close = () => setEditing(null)

  const save = (kind, draft) => {
    const fn = { task: upsertTask, dayType: upsertDayType, tag: upsertTag, block: upsertBlock }[kind]
    setRoutine(r => fn(r, draft))
    close()
    setToast('Saved.')
  }

  const del = (kind, item, label) => {
    if (!confirm(`Delete “${label}”?`)) return
    const fn = { task: removeTask, dayType: removeDayType, tag: removeTag, block: removeBlock }[kind]
    setRoutine(r => fn(r, item.id))
    close()
    setToast('Deleted.')
  }

  return (
    <div className="main-content">
      <PageHeader
        avatar={<ChevronLeft size={20} />}
        onAvatarClick={() => navigate(-1)}
        eyebrow="Your protocol"
        title="Routine"
      />

      <Segmented options={TABS} value={tab} onChange={setTab} />

      {tab === 'tasks'  && <TasksTab  routine={routine} setRoutine={setRoutine} onEdit={setEditing} />}
      {tab === 'days'   && <DaysTab   routine={routine} setRoutine={setRoutine} onEdit={setEditing} />}
      {tab === 'tags'   && <TagsTab   routine={routine} onEdit={setEditing} />}
      {tab === 'blocks' && <BlocksTab routine={routine} setRoutine={setRoutine} onEdit={setEditing} />}

      <Card variant="danger">
        <div className="row row-tight">
          <span className="row-icon row-icon-danger"><RotateCcw size={16} /></span>
          <div className="grow">
            <b>Reset to the starting routine</b>
            <div className="muted">
              Replaces every task, day type, tag and block with the ones STACK
              ships. Your logged days are not touched.
            </div>
          </div>
        </div>
        <Button
          variant="danger" block
          onClick={() => {
            if (confirm('Replace your routine with the starting one? Your logged days stay.')) {
              resetRoutine()
              setToast('Routine reset.')
            }
          }}
        >
          Reset routine
        </Button>
      </Card>

      {editing?.kind === 'task'    && <TaskSheet    routine={routine} editing={editing} onSave={save} onDelete={del} onClose={close} />}
      {editing?.kind === 'dayType' && <DayTypeSheet editing={editing} onSave={save} onDelete={del} onClose={close} />}
      {editing?.kind === 'tag'     && <TagSheet     editing={editing} onSave={save} onDelete={del} onClose={close} />}
      {editing?.kind === 'block'   && <BlockSheet   routine={routine} editing={editing} onSave={save} onDelete={del} onClose={close} />}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

/* ── Tasks ───────────────────────────────────────────────────────────────────
   Grouped by block, in block order — the same order Today renders, so the
   editor is a picture of the screen it edits. Unlike Today, an EMPTY block is
   shown rather than omitted: here it is the thing you are about to add to. */

function TasksTab({ routine, setRoutine, onEdit }) {
  const blank = blockId => ({
    kind: 'task',
    isNew: true,
    draft: {
      id: newId('task'), name: '', detail: '', block: blockId,
      tags: [], dayTypes: [], days: [], target: '', warn: '', wait: '',
    },
  })

  return (
    <>
      {routine.blocks.map(block => {
        const tasks = routine.tasks.filter(t => t.block === block.id)
        return (
          <section key={block.id}>
            <SectionHead
              title={block.label}
              sub={formatTimeRange(block.start, block.end)}
              action={
                <button className="icon-btn" aria-label={`Add a task to ${block.label}`}
                        onClick={() => onEdit(blank(block.id))}>
                  <Plus size={18} />
                </button>
              }
            />
            <Card>
              {!tasks.length && <div className="block-empty">Nothing here yet.</div>}
              {tasks.map((task, i) => {
                const days = taskDays(routine, task)
                const unscheduled = isUnscheduled(routine, task)
                return (
                  <EditRow
                    key={task.id}
                    title={task.name}
                    sub={task.detail}
                    warn={unscheduled}
                    meta={
                      <>
                        {unscheduled
                          ? <Tag tone="warn"><CalendarOff />Never scheduled</Tag>
                          : <Tag tone="neutral">{daysSummary(days)}</Tag>}
                        {task.tags.map(id => {
                          const tag = routine.tags.find(t => t.id === id)
                          return tag ? <Tag key={id} tone={tag.tone}>{tag.label}</Tag> : null
                        })}
                      </>
                    }
                    onEdit={() => onEdit({ kind: 'task', draft: { ...task } })}
                    onUp={i > 0 ? () => setRoutine(r => moveTask(r, task.id, -1)) : undefined}
                    onDown={i < tasks.length - 1 ? () => setRoutine(r => moveTask(r, task.id, 1)) : undefined}
                  />
                )
              })}
            </Card>
          </section>
        )
      })}
    </>
  )
}

function TaskSheet({ routine, editing, onSave, onDelete, onClose }) {
  const [d, setD] = useState(editing.draft)
  const set = patch => setD(prev => ({ ...prev, ...patch }))
  const toggle = (key, id) =>
    set({ [key]: d[key].includes(id) ? d[key].filter(x => x !== id) : [...d[key], id] })

  const days = taskDays(routine, d)

  return (
    <Sheet title={editing.isNew ? 'New task' : 'Edit task'} onClose={onClose}>
      <Field label="Name">
        <input value={d.name} onChange={e => set({ name: e.target.value })}
               placeholder="Creatine" autoFocus={editing.isNew} />
      </Field>

      <Field label="What to do" hint="The line under the name on the checklist.">
        <textarea rows={2} value={d.detail} onChange={e => set({ detail: e.target.value })}
                  placeholder="3–5g — take right after workout" />
      </Field>

      <Field label="Time block">
        <select value={d.block} onChange={e => set({ block: e.target.value })}>
          {routine.blocks.map(b => (
            <option key={b.id} value={b.id}>
              {b.label}{b.start ? ` · ${formatTime(b.start)}` : ''}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Tags" hint="Drives the by-tag breakdown on Overview.">
        <div className="chip-row">
          {routine.tags.map(t => (
            <Chip key={t.id} active={d.tags.includes(t.id)} onClick={() => toggle('tags', t.id)}>
              {t.label}
            </Chip>
          ))}
        </div>
      </Field>

      <Field
        label="Days it happens"
        hint="Pick the kinds of day. A task can belong to several — they add up."
      >
        <div className="chip-row">
          {routine.dayTypes.map(dt => (
            <Chip key={dt.id} active={d.dayTypes.includes(dt.id)} onClick={() => toggle('dayTypes', dt.id)}>
              {dt.name}
            </Chip>
          ))}
        </div>
      </Field>

      <Field
        label="…or add specific days"
        hint={days.length ? `Runs on: ${daysSummary(days)}` : 'Not scheduled yet — it won’t appear on Today.'}
      >
        <DayPicker value={d.days} onChange={v => set({ days: v })} />
      </Field>

      <Field label="Clock target" hint="Optional. Shown as a pill on the task.">
        <input value={d.target} onChange={e => set({ target: e.target.value })}
               placeholder="~9:00–9:30 PM" />
      </Field>

      <Field label="Wait before the next step" hint="Optional.">
        <input value={d.wait} onChange={e => set({ wait: e.target.value })}
               placeholder="Wait 2–3 min before next step" />
      </Field>

      <Field label="Warning" hint="Optional. Shown in the danger tone — keep it for real contraindications.">
        <input value={d.warn} onChange={e => set({ warn: e.target.value })}
               placeholder="Never layer with Vitamin C" />
      </Field>

      <Button block disabled={!d.name.trim()} onClick={() => onSave('task', { ...d, name: d.name.trim() })}>
        {editing.isNew ? 'Add task' : 'Save'}
      </Button>
      {!editing.isNew && (
        <Button variant="danger" block onClick={() => onDelete('task', d, d.name)}
                style={{ marginTop: 'var(--sp-2)' }}>
          Delete task
        </Button>
      )}
    </Sheet>
  )
}

/* ── Day types ───────────────────────────────────────────────────────────────
   The named kinds of day. Order is priority order for the badge, which is why
   these get reorder arrows and the tags below don't. */

function DaysTab({ routine, setRoutine, onEdit }) {
  return (
    <>
      <SectionHead
        title="Kinds of day"
        action={
          <button className="icon-btn" aria-label="Add a kind of day"
                  onClick={() => onEdit({
                    kind: 'dayType', isNew: true,
                    draft: { id: newId('day'), name: '', tone: 'neutral', days: [] },
                  })}>
            <Plus size={18} />
          </button>
        }
      />

      <Card>
        {routine.dayTypes.map((dt, i) => (
          <EditRow
            key={dt.id}
            title={dt.name}
            sub={daysSummary(dt.days)}
            warn={!dt.days.length}
            meta={dt.days.length === 7
              ? <Tag tone="neutral">No badge — covers every day</Tag>
              : <Tag tone={dt.tone}>{dt.name.toUpperCase()}</Tag>}
            onEdit={() => onEdit({ kind: 'dayType', draft: { ...dt } })}
            onUp={i > 0 ? () => setRoutine(r => moveDayType(r, dt.id, -1)) : undefined}
            onDown={i < routine.dayTypes.length - 1 ? () => setRoutine(r => moveDayType(r, dt.id, 1)) : undefined}
          />
        ))}
      </Card>

      <p className="prose muted" style={{ fontSize: 'var(--fs-xs)' }}>
        A weekday can be several kinds of day at once — that is the point.
        Sunday being an <b>active</b> day with <b>no workout</b> is why these
        overlap instead of being one setting. The topmost matching kind is the
        badge you see on Today, so drag <b>Gym</b> above <b>Active</b> to make a
        Monday read GYM. A kind covering all seven days never shows as a badge:
        it would be true of every day and so tell you nothing about this one.
      </p>
    </>
  )
}

function DayTypeSheet({ editing, onSave, onDelete, onClose }) {
  const [d, setD] = useState(editing.draft)
  const set = patch => setD(prev => ({ ...prev, ...patch }))

  return (
    <Sheet title={editing.isNew ? 'New kind of day' : 'Edit kind of day'} onClose={onClose}>
      <Field label="Name" hint="Shown in full as the page title, in caps as the badge.">
        <input value={d.name} onChange={e => set({ name: e.target.value })}
               placeholder="Active" autoFocus={editing.isNew} />
      </Field>

      <Field
        label="Which weekdays"
        hint={d.days.length ? daysSummary(d.days) : 'Pick at least one, or nothing will use it.'}
      >
        <DayPicker value={d.days} onChange={v => set({ days: v })} />
      </Field>

      <Field label="Badge tone">
        <TonePicker value={d.tone} onChange={v => set({ tone: v })} />
      </Field>

      <Button block disabled={!d.name.trim()} onClick={() => onSave('dayType', { ...d, name: d.name.trim() })}>
        {editing.isNew ? 'Add' : 'Save'}
      </Button>
      {!editing.isNew && (
        <Button variant="danger" block onClick={() => onDelete('dayType', d, d.name)}
                style={{ marginTop: 'var(--sp-2)' }}>
          Delete
        </Button>
      )}
    </Sheet>
  )
}

/* ── Tags ────────────────────────────────────────────────────────────────── */

function TagsTab({ routine, onEdit }) {
  return (
    <>
      <SectionHead
        title="Tags"
        action={
          <button className="icon-btn" aria-label="Add a tag"
                  onClick={() => onEdit({
                    kind: 'tag', isNew: true,
                    draft: { id: newId('tag'), label: '', tone: 'neutral' },
                  })}>
            <Plus size={18} />
          </button>
        }
      />

      <Card>
        {routine.tags.map(tag => {
          const n = routine.tasks.filter(t => t.tags.includes(tag.id)).length
          return (
            <EditRow
              key={tag.id}
              title={tag.label}
              sub={`${n} task${n === 1 ? '' : 's'}`}
              meta={<Tag tone={tag.tone}>{tag.label}</Tag>}
              onEdit={() => onEdit({ kind: 'tag', draft: { ...tag } })}
            />
          )
        })}
        {!routine.tags.length && <div className="block-empty">No tags yet.</div>}
      </Card>

      <p className="prose muted" style={{ fontSize: 'var(--fs-xs)' }}>
        Tags are what Overview splits the day by. A tag with no task today is
        left off that breakdown rather than shown at 0/0.
      </p>
    </>
  )
}

function TagSheet({ editing, onSave, onDelete, onClose }) {
  const [d, setD] = useState(editing.draft)
  const set = patch => setD(prev => ({ ...prev, ...patch }))

  return (
    <Sheet title={editing.isNew ? 'New tag' : 'Edit tag'} onClose={onClose}>
      <Field label="Name">
        <input value={d.label} onChange={e => set({ label: e.target.value })}
               placeholder="Habits" autoFocus={editing.isNew} />
      </Field>
      <Field label="Tone">
        <TonePicker value={d.tone} onChange={v => set({ tone: v })} />
      </Field>

      <Button block disabled={!d.label.trim()} onClick={() => onSave('tag', { ...d, label: d.label.trim() })}>
        {editing.isNew ? 'Add' : 'Save'}
      </Button>
      {!editing.isNew && (
        <Button variant="danger" block onClick={() => onDelete('tag', d, d.label)}
                style={{ marginTop: 'var(--sp-2)' }}>
          Delete tag
        </Button>
      )}
    </Sheet>
  )
}

/* ── Blocks ──────────────────────────────────────────────────────────────────
   Blocks are the headings on Today AND the source of the reminder schedule —
   there is no second list of notification times to keep in step, which is the
   bug the old build shipped with. */

const REMIND_OPTIONS = [
  { value: '',   label: 'No reminder' },
  { value: '5',  label: '5 minutes before' },
  { value: '10', label: '10 minutes before' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
]

function BlocksTab({ routine, setRoutine, onEdit }) {
  return (
    <>
      <SectionHead
        title="Time blocks"
        action={
          <button className="icon-btn" aria-label="Add a time block"
                  onClick={() => onEdit({
                    kind: 'block', isNew: true,
                    draft: { id: newId('block'), label: '', start: '', end: '', remind: null },
                  })}>
            <Plus size={18} />
          </button>
        }
      />

      <Card>
        {routine.blocks.map((b, i) => {
          const n = routine.tasks.filter(t => t.block === b.id).length
          return (
            <EditRow
              key={b.id}
              title={b.label}
              sub={`${n} task${n === 1 ? '' : 's'}`}
              meta={
                <>
                  {b.start
                    ? <Tag tone="brand"><Clock />{formatTimeRange(b.start, b.end)}</Tag>
                    : <Tag tone="neutral">No time set</Tag>}
                  {b.remind != null && b.start && (
                    <Tag tone="ok"><Hourglass />{b.remind} min before</Tag>
                  )}
                </>
              }
              onEdit={() => onEdit({ kind: 'block', draft: { ...b } })}
              onUp={i > 0 ? () => setRoutine(r => moveBlock(r, b.id, -1)) : undefined}
              onDown={i < routine.blocks.length - 1 ? () => setRoutine(r => moveBlock(r, b.id, 1)) : undefined}
            />
          )
        })}
      </Card>

      <p className="prose muted" style={{ fontSize: 'var(--fs-xs)' }}>
        Reminders come from these times — a block nudges you the chosen number of
        minutes before it starts, on exactly the days it has tasks, and reads out
        those tasks. There is no separate reminder list to keep in step.
      </p>
    </>
  )
}

function BlockSheet({ routine, editing, onSave, onDelete, onClose }) {
  const [d, setD] = useState(editing.draft)
  const set = patch => setD(prev => ({ ...prev, ...patch }))

  const taskCount = routine.tasks.filter(t => t.block === d.id).length
  const isLast = routine.blocks.length <= 1

  return (
    <Sheet title={editing.isNew ? 'New time block' : 'Edit time block'} onClose={onClose}>
      <Field label="Name">
        <input value={d.label} onChange={e => set({ label: e.target.value })}
               placeholder="Evening Skincare" autoFocus={editing.isNew} />
      </Field>

      <div className="field-row">
        <Field label="Starts">
          <input type="time" value={d.start} onChange={e => set({ start: e.target.value })} />
        </Field>
        <Field label="Ends">
          <input type="time" value={d.end} onChange={e => set({ end: e.target.value })} />
        </Field>
      </div>

      <Field
        label="Reminder"
        hint={d.start ? undefined : 'Set a start time first — a reminder needs something to count back from.'}
      >
        <select
          value={d.remind == null ? '' : String(d.remind)}
          disabled={!d.start}
          onChange={e => set({ remind: e.target.value === '' ? null : Number(e.target.value) })}
        >
          {REMIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>

      <Button block disabled={!d.label.trim()} onClick={() => onSave('block', { ...d, label: d.label.trim() })}>
        {editing.isNew ? 'Add block' : 'Save'}
      </Button>

      {!editing.isNew && !isLast && (
        <>
          <Button variant="danger" block onClick={() => onDelete('block', d, d.label)}
                  style={{ marginTop: 'var(--sp-2)' }}>
            Delete block
          </Button>
          {taskCount > 0 && (
            <p className="prose muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--sp-2)' }}>
              Its {taskCount} task{taskCount === 1 ? '' : 's'} will move to{' '}
              <b>{routine.blocks.find(b => b.id !== d.id)?.label}</b> rather than
              being deleted.
            </p>
          )}
        </>
      )}
    </Sheet>
  )
}
