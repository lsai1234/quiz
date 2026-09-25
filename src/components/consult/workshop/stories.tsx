'use client'

import { useState, type ReactNode } from 'react'
import { SceneShell } from '../SceneShell'
import { ChargeMeter, type MeterSection } from '../ChargeMeter'
import { NextButton, QuietLink } from '../controls'

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
          fontFamily: 'var(--amp-font-mono)',
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

export const STORIES: Story[] = [
  { id: 'shell', title: 'Scene shell', render: () => <ShellStory /> },
  { id: 'meter', title: 'Charge meter', render: () => <MeterStory /> },
]
