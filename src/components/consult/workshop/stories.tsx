'use client'

import { useRef, useState, type ReactNode } from 'react'
import { fly, settledBox, type FlightToken, type RingSlot } from '@/lib/consult/flight'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { SceneShell } from '../SceneShell'
import { ChargeMeter, type MeterSection } from '../ChargeMeter'
import { NextButton, QuietLink } from '../controls'
import { Amp, type AmpState } from '../Amp'
import { ChargeProfileChart } from '../ChargeProfileChart'

/**
 * The workshop's stories: each renders one piece of the consult on its own,
 * with fake answers. Add a scene here as it is built.
 */

export interface Story {
  id: string
  title: string
  render: () => ReactNode
}

const FAKE_METER: MeterSection[] = [
  { id: 'you', label: 'You', fill: 1 },
  { id: 'move', label: 'Move', fill: 0.5 },
  { id: 'rest', label: 'Rest', fill: 0 },
  { id: 'fuel', label: 'Fuel', fill: 0 },
  { id: 'body', label: 'Body', fill: 0 },
  { id: 'check', label: 'Check', fill: 0 },
]

function ShellStory() {
  const [jumped, setJumped] = useState<string | null>(null)
  return (
    <SceneShell
      index={4}
      total={12}
      sectionLabel="Training"
      meter={FAKE_METER}
      currentSectionId="move"
      onJump={setJumped}
      onBack={() => undefined}
      reaction={jumped ? `Jump to ${jumped}` : '25–34. Noted.'}
      question="Map your training week"
      hint="Tap a day to cycle through rest, gym, cardio and sport."
      action={<NextButton />}
      footer={<QuietLink icon="spark">Tell Amp more</QuietLink>}
    >
      <div
        className="flex items-center justify-center"
        style={{
          minHeight: 'calc(var(--amp-space-10) * 4)',
          borderRadius: 'var(--amp-radius-panel)',
          border: 'var(--amp-hairline) dashed var(--amp-edge-strong)',
          color: 'var(--amp-ink-3)',
          fontFamily: 'var(--amp-font-label)',
          fontSize: 'var(--amp-text-data)',
          letterSpacing: 'var(--amp-tracking-data)',
        }}
      >
        INTERACTION AREA
      </div>
    </SceneShell>
  )
}

function MeterStory() {
  const [step, setStep] = useState(5)
  const sections: MeterSection[] = FAKE_METER.map((s, i) => ({
    ...s,
    fill: Math.min(1, Math.max(0, (step - i * 2) / 2)),
  }))
  const current = sections[Math.min(sections.length - 1, Math.floor(step / 2))].id
  return (
    <div className="flex flex-col items-center" style={{ gap: 'var(--amp-space-5)', padding: 'var(--amp-space-10) var(--amp-gutter)' }}>
      <ChargeMeter sections={sections} currentId={current} onJump={(id) => setStep(FAKE_METER.findIndex((s) => s.id === id) * 2)} />
      <div className="flex" style={{ gap: 'var(--amp-space-2)', width: '100%' }}>
        <NextButton onClick={() => setStep((s) => Math.max(0, s - 1))}>−</NextButton>
        <NextButton onClick={() => setStep((s) => Math.min(12, s + 1))}>+</NextButton>
      </div>
    </div>
  )
}

const AMP_STATES: AmpState[] = ['idle', 'watching', 'thinking', 'reading', 'calm', 'charged']

function AmpStory() {
  return (
    <div className="grid grid-cols-3" style={{ gap: 'var(--amp-space-6)', padding: 'var(--amp-space-10) var(--amp-gutter)' }}>
      {AMP_STATES.map((state) => (
        <div key={state} className="flex flex-col items-center" style={{ gap: 'var(--amp-space-2)' }}>
          <Amp state={state} size="md" lean={state === 'watching' ? 1 : 0} />
          <span className="uppercase" style={{ fontFamily: 'var(--amp-font-label)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)', color: 'var(--amp-ink-2)' }}>
            {state}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ── Shared-element flights (plan Phase 7.1) ──────────────────────────────── */

/** A stand-in for the day ring (item 3): its five slots, round a circle. */
const RING_SLOTS: { slot: RingSlot; angle: number; answer: string; scene: FlightToken['scene'] }[] = [
  { slot: 'sleep', angle: -90, answer: '23:00–07:00', scene: 'sleep' },
  { slot: 'caffeine', angle: -18, answer: '3 a day', scene: 'caffeine' },
  { slot: 'training', angle: 54, answer: '4 a week', scene: 'training' },
  { slot: 'daylight', angle: 126, answer: 'Most days', scene: 'daylight' },
  { slot: 'energy', angle: 198, answer: '6 / 10', scene: 'energy' },
]

/**
 * Answer a stand-in scene, press Next, and the answer flies into its slot as
 * the "next scene" (a fresh card) arrives. The real thing lands on Amp until
 * the ring is built; this shows where it's going.
 */
function FlightStory() {
  const reduced = useReducedMotion()
  const [step, setStep] = useState(0)
  const [filled, setFilled] = useState<Partial<Record<RingSlot, string>>>({})
  const source = useRef<HTMLDivElement>(null)
  const current = RING_SLOTS[step % RING_SLOTS.length]

  const next = () => {
    const token: FlightToken = { scene: current.scene, slot: current.slot, label: current.answer }
    const from = source.current ? settledBox(source.current) : null
    setStep((n) => n + 1)
    const land = () => setFilled((f) => ({ ...f, [token.slot]: token.label }))
    const target = document.querySelector(`[data-flight-slot="${token.slot}"]`)
    const root = (source.current?.closest('.amp-consult') as HTMLElement | null) ?? undefined
    const flight = !reduced && from && target ? fly(token, from, target, root) : null
    if (flight) flight.finished.then(land, land)
    else land()
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-5)', padding: 'var(--amp-space-8) var(--amp-gutter)' }}>
      <div className="relative mx-auto" style={{ width: 'min(100%, calc(var(--amp-space-10) * 6))', aspectRatio: '1' }} aria-label="Day ring (stand-in)" role="group">
        <div className="absolute" style={{ inset: 'var(--amp-space-8)', borderRadius: 'var(--amp-radius-pill)', border: 'var(--amp-hairline) dashed var(--amp-edge-strong)' }} />
        <div className="absolute flex items-center justify-center" style={{ inset: 0 }}>
          <Amp state="idle" size="md" />
        </div>
        {RING_SLOTS.map(({ slot, angle }) => (
          <div
            key={slot}
            data-flight-slot={slot}
            data-filled={filled[slot] ? 'true' : 'false'}
            className="absolute flex items-center justify-center"
            style={{
              left: `calc(50% + ${Math.cos((angle * Math.PI) / 180).toFixed(3)} * (50% - var(--amp-space-6)))`,
              top: `calc(50% + ${Math.sin((angle * Math.PI) / 180).toFixed(3)} * (50% - var(--amp-space-6)))`,
              transform: 'translate(-50%, -50%)',
              minWidth: 'var(--amp-space-10)',
              minHeight: 'var(--amp-space-6)',
              padding: '0 var(--amp-space-2)',
              borderRadius: 'var(--amp-radius-pill)',
              border: `var(--amp-hairline) solid ${filled[slot] ? 'var(--amp-accent-line)' : 'var(--amp-edge)'}`,
              background: filled[slot] ? 'var(--amp-accent-fill)' : 'transparent',
              color: filled[slot] ? 'var(--amp-accent)' : 'var(--amp-ink-3)',
              fontFamily: 'var(--amp-font-label)',
              fontSize: 'var(--amp-text-data)',
              whiteSpace: 'nowrap',
            }}
          >
            {filled[slot] ?? slot}
          </div>
        ))}
      </div>
      <div
        key={step}
        ref={source}
        className={reduced ? undefined : 'amp-anim-rise'}
        style={{ padding: 'var(--amp-space-5)', borderRadius: 'var(--amp-radius-panel)', border: 'var(--amp-hairline) solid var(--amp-edge-strong)', background: 'var(--amp-glass)' }}
      >
        <p className="uppercase" style={{ fontFamily: 'var(--amp-font-label)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)', color: 'var(--amp-ink-2)' }}>
          {current.slot}
        </p>
        <p style={{ fontWeight: 'var(--amp-weight-bold)', fontSize: 'var(--amp-text-lead)', marginTop: 'var(--amp-space-1)' }}>{current.answer}</p>
      </div>
      <NextButton onClick={next}>Next</NextButton>
      <QuietLink onClick={() => (setFilled({}), setStep(0))}>Start again</QuietLink>
    </div>
  )
}

export const STORIES: Story[] = [
  { id: 'shell', title: 'Scene shell', render: () => <ShellStory /> },
  { id: 'meter', title: 'Charge meter', render: () => <MeterStory /> },
  { id: 'amp', title: 'Amp', render: () => <AmpStory /> },
  {
    id: 'profile',
    title: 'Charge profile',
    render: () => (
      <div style={{ padding: 'var(--amp-space-10) var(--amp-gutter)' }}>
        <ChargeProfileChart profile={{ training: 100, energy: 40, sleep: 52, daylight: 15, nutrition: 50, recovery: 68 }} />
      </div>
    ),
  },
  { id: 'flight', title: 'Shared flight', render: () => <FlightStory /> },
]
