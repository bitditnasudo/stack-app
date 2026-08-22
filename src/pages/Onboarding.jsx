/* ============================================================================
   ONBOARDING — first launch, three screens, one decision each.
   ============================================================================
   The template ships an onboarding gate that STACK never used, because there
   was nothing to configure before first use. There is now: where your data
   lives, and what your week looks like.

   SIGN-IN IS PROMINENT AND SKIPPABLE. It is the first thing offered and the
   primary button, because a routine you spend twenty minutes building should be
   backed up before you build it. It is not REQUIRED, because a failed OAuth, a
   wrong Google account or no signal would otherwise leave the app unusable —
   and STACK works completely offline. "Set up later" leads to the same place
   Settings does.

   Finishing sets `settings.onboardingDone`, which is the only thing that closes
   this. It has defaulted to `true` since the rewrite, so no existing device
   will ever see these screens — an upgrade opens on Today exactly as before.
   ========================================================================== */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cloud, Check, ArrowRight, SlidersHorizontal } from 'lucide-react'
import { Button, Steps, Card } from '../components/UI.jsx'
import { useStore } from '../lib/store.jsx'
import { BrandMark } from '../app.config.jsx'
import { defaultRoutine, blankRoutine } from '../lib/protocol.js'
import { DAY_ORDER, DAY_LABELS, templateForDay } from '../lib/routine.js'

export default function Onboarding() {
  const navigate = useNavigate()
  const { sync, connectGoogle, setSettings, setRoutine } = useStore()
  const [step, setStep] = useState(0)

  const finish = (routine, then) => {
    if (routine) setRoutine(() => routine)
    setSettings({ onboardingDone: true })
    navigate(then, { replace: true })
  }

  return (
    <div className="onboard">
      <Steps count={3} current={step} />

      {step === 0 && (
        <>
          <div className="onboard-mark"><BrandMark size={30} /></div>
          <h1>STACK</h1>
          <p className="lead">
            Your daily routine, as a sequence you actually move through — habits,
            the order they happen in, and the waits between them.
          </p>
          <div className="onboard-actions">
            <Button onClick={() => setStep(1)}>Get started <ArrowRight size={15} /></Button>
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

      {step === 2 && <WeekChoice onFinish={finish} />}
    </div>
  )
}

/* The one choice that decides how much work the next twenty minutes are: start
   from a filled week and edit it down, or from nothing. Both land in the editor
   — the difference is only what is already there. */
function WeekChoice({ onFinish }) {
  const preview = defaultRoutine()

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
        <Button onClick={() => onFinish(defaultRoutine(), '/routine')}>
          Start from the example week
        </Button>
        <Button variant="secondary" onClick={() => onFinish(blankRoutine(), '/routine')}>
          Start empty
        </Button>
        <Button variant="plain" onClick={() => onFinish(defaultRoutine(), '/')}>
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
