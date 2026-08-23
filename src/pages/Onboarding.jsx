/* ============================================================================
   ONBOARDING — first launch. Five screens, one decision each.
   ============================================================================
   The order is deliberate and it is cheapest-first:

     0  NAME       one field, no consequences. Asking for it first means the
                   very next screen can already address you by it.
     1  STORAGE    Google Drive. Offered early because a routine you spend
                   twenty minutes building should be backed up before you build
                   it — and SKIPPABLE, because a failed OAuth, a wrong Google
                   account or no signal would otherwise leave the app unusable.
                   STACK works completely offline either way.
     2  DAY SHAPE  wake and sleep. Two wheels; this is the only thing on this
                   flow that later screens compute from, and it is what the
                   Home dashboard's "day elapsed" bar measures against.
     3  START DAY  which weekday you want to build first. Handed to the
                   guided builder as `?day=N`, which walks the week from there.
     4  YOUR WEEK  seed, blank, or straight in.

   WHY NAME AND TIMES ARE NOT BLOCKING. Every one of these five can be walked
   past. `dayProgress` returns null for an unset time and the dashboard omits
   the bar rather than inventing a default; the greeting falls back to "Hello".
   A first-run flow that will not let you into the app until you have answered
   it is a flow people force-quit.

   Finishing sets `settings.onboardingDone`, which is the only thing that closes
   this. It has defaulted to `true` since the rewrite, so no existing device
   will ever see these screens — an upgrade opens on Today exactly as before.
   ========================================================================== */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cloud, Check, ArrowRight, SlidersHorizontal, User, Clock3 } from 'lucide-react'
import { Button, Steps, Card, Field, TimeWheel } from '../components/UI.jsx'
import { useStore } from '../lib/store.jsx'
import { BrandMark } from '../app.config.jsx'
import { defaultRoutine, blankRoutine } from '../lib/protocol.js'
import { DAY_ORDER, DAY_LABELS, templateForDay, dedupeLibrary } from '../lib/routine.js'

const STEP_COUNT = 5

export default function Onboarding() {
  const navigate = useNavigate()
  const { sync, connectGoogle, setSettings, setProfile, setRoutine } = useStore()
  const [step, setStep] = useState(0)

  const [name, setName] = useState('')
  const [wake, setWake] = useState('07:00')
  const [sleep, setSleep] = useState('23:00')
  const [startDay, setStartDay] = useState(1)   // Monday

  /* Everything this flow collected is committed in ONE write, at the end.
     Writing each answer as it is given means a flow abandoned on screen 3
     leaves a device half-configured with `onboardingDone` still false, so the
     next launch asks again and overwrites what it already had. */
  const finish = (routine, then) => {
    if (routine) setRoutine(() => routine)
    if (name.trim()) setProfile({ name: name.trim().slice(0, 40) })
    setSettings({ onboardingDone: true, wakeTime: wake, sleepTime: sleep })
    navigate(then, { replace: true })
  }

  return (
    <div className="onboard">
      <Steps count={STEP_COUNT} current={step} />

      {step === 0 && (
        <>
          <div className="onboard-mark"><BrandMark size={30} /></div>
          <h1>STACK</h1>
          <p className="lead">
            Your daily routine, as a sequence you actually move through — habits,
            the order they happen in, and the waits between them.
          </p>

          <Field label="What should I call you?" hint="Only used to say hello. It never leaves your device unless you connect Drive.">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              autoFocus
              maxLength={40}
              autoComplete="given-name"
              onKeyDown={e => { if (e.key === 'Enter') setStep(1) }}
            />
          </Field>

          <div className="onboard-actions">
            <Button onClick={() => setStep(1)}>
              {name.trim() ? <>Hello, {name.trim()} <ArrowRight size={15} /></> : <>Get started <ArrowRight size={15} /></>}
            </Button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <div className="onboard-mark"><Cloud size={28} /></div>
          <h1>Keep it safe</h1>
          <p className="lead">
            STACK saves to your device. Connect Google Drive and it also backs up
            to your <b>STACK APP</b> folder — one file, and any other device you
            sign in on picks up where this one left off.
          </p>

          {sync.connected ? (
            <Card variant="ok">
              <div className="row row-tight">
                <span className="row-icon"><Check size={16} /></span>
                <div className="grow"><b>Connected</b>
                  <div className="muted">Your routine will back up as you build it.</div>
                </div>
              </div>
            </Card>
          ) : null}

          <div className="onboard-actions">
            {!sync.connected && sync.configured && (
              <Button onClick={connectGoogle}><Cloud size={15} /> Connect Google Drive</Button>
            )}
            <Button variant={sync.connected ? 'primary' : 'secondary'} onClick={() => setStep(2)}>
              {sync.connected ? <>Next <ArrowRight size={15} /></> : 'Set up later'}
            </Button>
          </div>
          {!sync.connected && (
            <p className="prose muted" style={{ fontSize: 'var(--fs-xs)' }}>
              You can connect any time in Settings. Nothing is lost by waiting —
              everything works offline either way.
            </p>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <div className="onboard-mark"><Clock3 size={28} /></div>
          <h1>First, let me get to know you</h1>
          <p className="lead">
            When does your day start and end? STACK uses these two to show how
            much of the day has gone beside how much of your stack is done.
          </p>

          <TimeWheel tone="wake"  label="I wake up at"  value={wake}  onChange={setWake} />
          <TimeWheel tone="sleep" label="I go to bed at" value={sleep} onChange={setSleep} />

          <div className="onboard-actions">
            <Button onClick={() => setStep(3)}>Next <ArrowRight size={15} /></Button>
          </div>
          <p className="prose muted" style={{ fontSize: 'var(--fs-xs)' }}>
            A bedtime after midnight is fine — STACK reads 00:30 as the end of
            the day that started this morning, not the beginning of tomorrow.
          </p>
        </>
      )}

      {step === 3 && (
        <>
          <div className="onboard-mark"><User size={28} /></div>
          <h1>Where do we start?</h1>
          <p className="lead">
            Pick the day you want to build first. STACK walks the rest of the
            week from there, one day at a time — you can stop whenever you like.
          </p>

          <div className="onboard-days" role="radiogroup" aria-label="Start day">
            {DAY_ORDER.map(d => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={startDay === d}
                className={`day-choice${startDay === d ? ' is-active' : ''}`}
                onClick={() => setStartDay(d)}
              >
                {DAY_LABELS[d]}
              </button>
            ))}
          </div>

          <div className="onboard-actions">
            <Button onClick={() => setStep(4)}>Next <ArrowRight size={15} /></Button>
          </div>
        </>
      )}

      {step === 4 && <WeekChoice startDay={startDay} onFinish={finish} />}
    </div>
  )
}

/* The one choice that decides how much work the next twenty minutes are: start
   from a filled week and edit it down, or from nothing. Both land in the editor
   — the difference is only what is already there.

   THE SEED IS DEDUPED ON THE WAY IN, the same way `resetRoutine` does it. The
   seed still carries the AM/PM duplicate pairs because its ids are the frozen
   storage contract; every path that introduces it has to fold them, or a fresh
   install starts life holding the exact workaround the migration removes. */
function WeekChoice({ startDay, onFinish }) {
  const preview = defaultRoutine()
  const seeded = () => dedupeLibrary(defaultRoutine()).routine

  /* Into the GUIDED BUILDER, not the editor. Step 3 picked a starting day and
     this is what consumes it: the builder walks the week from there, one day
     per screen. The editor is still one tap away for anyone who would rather
     jump straight in — that is what "Just take me in" leads past. */
  const into = `/build?day=${startDay}`

  return (
    <>
      <div className="onboard-mark"><SlidersHorizontal size={28} /></div>
      <h1>Build your week</h1>
      <p className="lead">
        Every weekday runs a named routine — “Gym”, “Rest”, whatever you call
        it. Days that are the same share one, so you build it once.
      </p>

      <div className="onboard-week" aria-hidden="true">
        {DAY_ORDER.map(d => {
          const tpl = templateForDay(preview, d)
          return (
            <span key={d} style={{ background: tpl ? tpl.color : 'var(--neutral-wash)', color: '#141414' }}>
              {DAY_LABELS[d].slice(0, 1)}
            </span>
          )
        })}
      </div>

      <div className="onboard-actions">
        <Button onClick={() => onFinish(seeded(), into)}>
          Start from the example week
        </Button>
        <Button variant="secondary" onClick={() => onFinish(blankRoutine(), into)}>
          Start empty
        </Button>
        <Button variant="plain" onClick={() => onFinish(seeded(), '/')}>
          Just take me in
        </Button>
      </div>
      <p className="prose muted" style={{ fontSize: 'var(--fs-xs)' }}>
        The example week is the one STACK ships with — a full skincare and
        supplement routine. Nothing in it is permanent; rename, reorder or delete
        any of it.
      </p>
    </>
  )
}
