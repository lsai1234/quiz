'use client'

import { useRef, useState, type ReactNode } from 'react'
import { fly, settledBox, type FlightToken, type RingSlot } from '@/lib/consult/flight'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { SceneShell } from '../SceneShell'
import { ChargeMeter, type MeterSection } from '../ChargeMeter'
import { NextButton, QuietLink, Segmented } from '../controls'
import { Amp, type AmpState } from '../Amp'
import { DayRing } from '../DayRing'
import { trainingDays } from '@/lib/consult/training'
import { EMPTY_ANSWERS, type ConsultAnswers } from '@/lib/consult/types'
import { AMP_NEXT_EVENT, droopFor, type AmpMood, type AmpRig } from '@/lib/consult/amp-rig'
import type { AmpReaction } from '@/lib/consult/motion'
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

const AMP_STATES: AmpState[] = ['idle', 'watching', 'thinking', 'reading', 'calm', 'charged', 'hunch']

const label = { fontFamily: 'var(--amp-font-label)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)', color: 'var(--amp-ink-2)' } as const

/** Every state, and Pinpoint's two moods, side by side. */
function AmpStory() {
  const poses: { name: string; state: AmpState; rig?: AmpRig }[] = [
    ...AMP_STATES.map((state) => ({ name: state, state })),
    { name: 'curious', state: 'idle', rig: { mood: 'curious' } },
    { name: 'leaning', state: 'idle', rig: { mood: 'leaning' } },
  ]
  return (
    <div className="grid grid-cols-3" data-amp-grid style={{ gap: 'var(--amp-space-6)', padding: 'var(--amp-space-10) var(--amp-gutter)' }}>
      {poses.map((p) => (
        <div key={p.name} className="flex flex-col items-center" style={{ gap: 'var(--amp-space-2)' }}>
          <Amp state={p.state} size="md" lean={p.state === 'watching' ? 1 : 0} rig={p.rig} />
          <span className="uppercase" style={label}>
            {p.name}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Amp, alive (plan Phase 7.2): the rig's inputs as the consult's inputs would
 * set them. Move a finger (or the mouse) to see his eyes follow; tap to
 * squash; Next to stretch. Under reduced motion he holds each pose still.
 */
function AmpAliveStory() {
  const [bed, setBed] = useState(22 * 60)
  const [energy, setEnergy] = useState(5)
  const [squint, setSquint] = useState(false)
  const [mood, setMood] = useState<AmpMood | 'none'>('none')
  const [reaction, setReaction] = useState<{ name: AmpReaction; id: number } | null>(null)
  const react = (name: AmpReaction) => setReaction((r) => ({ name, id: (r?.id ?? 0) + 1 }))
  const clock = `${String(Math.floor(bed / 60) % 24).padStart(2, '0')}:${String(bed % 60).padStart(2, '0')}`
  return (
    <div className="flex flex-col items-center" style={{ gap: 'var(--amp-space-4)', padding: 'var(--amp-space-8) var(--amp-gutter)' }}>
      <div data-amp-alive>
        <Amp state={squint ? 'watching' : 'idle'} size="lg" reaction={reaction} rig={{ droop: droopFor(bed), glow: energy / 10, squint: squint ? 1 : 0, mood: mood === 'none' ? null : mood }} />
      </div>
      <div className="grid w-full grid-cols-2" style={{ gap: 'var(--amp-space-2)' }}>
        <QuietLink onClick={() => setBed((b) => (b + 30) % (24 * 60))}>Bedtime later ({clock})</QuietLink>
        <QuietLink onClick={() => setBed(21 * 60)}>Bedtime 21:00</QuietLink>
        <QuietLink onClick={() => setEnergy((e) => Math.min(10, e + 1))}>Energy up ({energy}/10)</QuietLink>
        <QuietLink onClick={() => setEnergy((e) => Math.max(0, e - 1))}>Energy down</QuietLink>
        <QuietLink aria-pressed={squint} onClick={() => setSquint((v) => !v)}>
          {squint ? 'Sun moving' : 'Move the sun'}
        </QuietLink>
        <QuietLink onClick={() => react('jitter')}>Add a cup</QuietLink>
        <QuietLink onClick={() => react('flex')}>Add a gym day</QuietLink>
        <QuietLink onClick={() => react('eureka')}>Hunch confirmed</QuietLink>
      </div>
      <Segmented<AmpMood | 'none'>
        label="Pinpoint’s mood"
        options={[
          { value: 'none', label: 'None' },
          { value: 'curious', label: 'Curious' },
          { value: 'leaning', label: 'Leaning in' },
        ]}
        value={mood}
        onChange={setMood}
      />
      <NextButton onClick={() => window.dispatchEvent(new Event(AMP_NEXT_EVENT))}>Next</NextButton>
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

/* ── The day ring (plan Phase 7.3) ─────────────────────────────────────── */

/** Answers as a consult would give them, one more each step; then Pinpoint's times. */
const RING_STEPS: { said: string; answers: Partial<ConsultAnswers> }[] = [
  { said: 'Nothing yet', answers: {} },
  { said: 'Training: 4 days a week', answers: { training: trainingDays(['gym', 'rest', 'gym', 'rest', 'cardio', 'sport', 'rest']) } },
  { said: 'Afternoon energy 4/10', answers: { energy: 4 } },
  { said: 'Sleep 23:30 to 06:00', answers: { sleep: { bed: 23 * 60 + 30, wake: 6 * 60, quality: 'ok' } } },
  { said: 'Daylight most days', answers: { daylight: 'most' } },
  { said: '3 caffeinated drinks a day', answers: { caffeine: { coffee: 2, tea: 1, energy: 0 } } },
  {
    said: 'Pinpoint: last coffee about 16:00, trains around 18:30',
    answers: {
      pinpoint: {
        steps: [
          { kind: 'probe', probe: 'last-caffeine', answer: {}, minutes: 16 * 60, stage: 'follow-fuel' },
          { kind: 'probe', probe: 'train-when', answer: {}, minutes: 18 * 60 + 30, stage: 'follow-move' },
        ],
        stopped: false,
      },
    },
  },
]

/** The ring in the consult (round Amp) and the larger one for the read, filling in. */
function DayRingStory() {
  const [step, setStep] = useState(RING_STEPS.length - 1)
  const answers = RING_STEPS.slice(0, step + 1).reduce<ConsultAnswers>((a, s) => ({ ...a, ...s.answers }), { ...EMPTY_ANSWERS })
  return (
    <div className="flex flex-col items-center" style={{ gap: 'var(--amp-space-5)', padding: 'var(--amp-space-8) var(--amp-gutter)' }}>
      <div className="flex items-center" style={{ gap: 'var(--amp-space-3)' }} data-ring-sm>
        <DayRing answers={answers}>
          <Amp state="idle" />
        </DayRing>
        <span className="uppercase" style={{ ...label, color: 'var(--amp-accent)' }}>
          {RING_STEPS[step].said}
        </span>
      </div>
      <div data-ring-lg>
        <DayRing answers={answers} size="lg">
          <Amp state="idle" size="lg" />
        </DayRing>
      </div>
      <div className="grid w-full grid-cols-2" style={{ gap: 'var(--amp-space-2)' }}>
        <NextButton onClick={() => setStep((n) => Math.max(0, n - 1))}>Back an answer</NextButton>
        <NextButton onClick={() => setStep((n) => Math.min(RING_STEPS.length - 1, n + 1))}>Next answer</NextButton>
      </div>
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
  { id: 'amp-alive', title: 'Amp, alive', render: () => <AmpAliveStory /> },
  { id: 'day-ring', title: 'Day ring', render: () => <DayRingStory /> },
]
