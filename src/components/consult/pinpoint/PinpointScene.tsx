'use client'

import { useEffect, useRef, useState } from 'react'
import { LIMITS } from '@/lib/consult/pinpoint/choose'
import { EMPTY_PINPOINT, isOut, leads as allLeads } from '@/lib/consult/pinpoint/leads'
import { pinpointView, questionsAsked, replaceFollowUp, withStep } from '@/lib/consult/pinpoint/screen'
import type { PinpointStage } from '@/lib/consult/pinpoint/types'
import { NextButton, QuietLink } from '../controls'
import type { SceneProps } from '../scenes/registry'
import { ProbeFormat, type ProbeAnswer } from './formats'
import { HunchCard, LeadBars, LeadsSheet, PatternMap, Plain } from './parts'

/**
 * Pinpoint on screen (plan v5 §5): the round, and the follow-ups inside the
 * core sections. What to show comes from `pinpointView`, from the answers
 * alone; this only draws it and writes what's picked.
 *
 * The round moves on in place: an answer, and the next question arrives with
 * Amp's hot-and-cold line above it. A follow-up is one question, and then
 * the consult moves on. In comfort mode nothing moves by itself: a tap
 * selects, and Next commits it.
 */

/** Formats a single tap answers, which comfort mode holds until Next. */
const ONE_TAP = new Set(['scenario', 'how-often', 'this-or-that'])

const mono = {
  fontFamily: 'var(--amp-font-mono)',
  fontSize: 'var(--amp-text-data)',
  letterSpacing: 'var(--amp-tracking-data)',
} as const

export function PinpointScene({ scene, answers, onAnswer, comfort, onNext }: SceneProps) {
  const stage = scene.id as PinpointStage
  const round = stage === 'pinpoint'
  const view = pinpointView(stage, answers)
  const pp = answers.pinpoint ?? EMPTY_PINPOINT
  const [pending, setPending] = useState<ProbeAnswer | null>(null)
  const [sheet, setSheet] = useState(false)
  const leads = allLeads(answers)
  const asked = questionsAsked(answers)
  const write = (next: typeof pp) => onAnswer({ pinpoint: next })

  const viewKey = view.kind === 'probe' ? `probe:${view.probe.id}` : view.kind === 'hunch' ? `hunch:${view.lead.pattern.id}` : view.kind
  const first = useRef(true)
  useEffect(() => {
    setPending(null)
    // A new question in the round: the heading takes focus, as on a new scene.
    if (first.current) {
      first.current = false
      return
    }
    if (round) document.querySelector<HTMLElement>('.amp-consult h1')?.focus({ preventScroll: true })
  }, [viewKey, round])

  function commit(p: ProbeAnswer | { unsure: true }) {
    if (view.kind !== 'probe') return
    const step = 'unsure' in p ? { kind: 'probe' as const, probe: view.probe.id, answer: {}, unsure: true, stage } : { kind: 'probe' as const, probe: view.probe.id, answer: p.answer, minutes: p.minutes, stage }
    setPending(null)
    if (round) {
      write(withStep(answers, step)!)
    } else {
      write(replaceFollowUp(answers, stage, step)!)
      onNext?.()
    }
  }

  const buildNow = round && asked >= LIMITS.buildNowFrom ? () => write({ ...pp, stopped: true }) : undefined
  const contenders = leads.filter((l) => l.state !== 'no' && l.state !== 'out' && l.p >= 0.3)

  let body: React.ReactNode
  switch (view.kind) {
    case 'intro': {
      const top = leads.filter((l) => l.state === 'live').sort((x, y) => y.p - x.p).slice(0, 3)
      body = (
        <div className="flex flex-col" style={{ gap: 'var(--amp-space-4)' }}>
          <PatternMap answers={answers} leads={top} title={`Amp’s leads so far: ${top.map((l) => l.pattern.name).join(', ')}`} />
          <ul className="flex flex-col" aria-label="Leads so far">
            {top.map((l) => (
              <li key={l.pattern.id} className="flex items-center justify-between" style={{ gap: 'var(--amp-space-3)', padding: 'var(--amp-space-2) 0', borderBottom: 'var(--amp-hairline) solid var(--amp-edge)' }}>
                <span style={{ fontSize: 'var(--amp-text-meta)' }}>{l.pattern.name}</span>
                <LeadBars p={l.p} />
              </li>
            ))}
          </ul>
          <NextButton onClick={() => write({ ...pp, started: true })}>Let’s go</NextButton>
        </div>
      )
      break
    }
    case 'probe': {
      const answered = view.answered ? { answer: view.answered.answer, minutes: view.answered.minutes } : undefined
      const holding = comfort && ONE_TAP.has(view.probe.format)
      body = (
        <div className="flex flex-col" style={{ gap: 'var(--amp-space-3)' }}>
          <ProbeFormat
            key={view.probe.id}
            probe={view.probe}
            text={view.text}
            comfort={comfort}
            selected={pending ?? answered}
            pick={(p) => (holding ? setPending(p) : commit(p))}
          />
          {holding && (
            <NextButton ready={Boolean(pending)} nudge="Pick the one that fits best." onClick={() => pending && commit(pending)}>
              Next
            </NextButton>
          )}
          <div className="flex flex-wrap items-center justify-center" style={{ gap: 'var(--amp-space-1) var(--amp-space-4)' }}>
            <QuietLink onClick={() => commit({ unsure: true })}>Not sure</QuietLink>
            {buildNow && <QuietLink onClick={buildNow}>Build my stack now</QuietLink>}
          </div>
        </div>
      )
      break
    }
    case 'hunch':
      body = <HunchCard lead={view.lead} comfort={comfort} onVerdict={(verdict) => write(withStep(answers, { kind: 'verdict', pattern: view.lead.pattern.id, verdict, stage: 'pinpoint' })!)} />
      break
    case 'checkpoint':
      body = (
        <div className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
          <NextButton onClick={() => write(withStep(answers, { kind: 'checkpoint', choice: 'more', stage: 'pinpoint' })!)}>Keep going</NextButton>
          <Plain onClick={() => write({ ...withStep(answers, { kind: 'checkpoint', choice: 'build', stage: 'pinpoint' })!, stopped: true })}>Build my stack now</Plain>
        </div>
      )
      break
    case 'done': {
      const out = leads.filter((l) => isOut(l) && l.tested > 0)
      body = (
        <div className="flex flex-col" style={{ gap: 'var(--amp-space-3)' }}>
          {view.found.map((l) => (
            <div
              key={l.pattern.id}
              className="amp-anim-rise"
              style={{ padding: 'var(--amp-space-4)', borderRadius: 'var(--amp-radius-panel)', border: 'var(--amp-hairline) solid var(--amp-go-line)', background: 'var(--amp-go-fill)' }}
            >
              <p className="uppercase" style={{ ...mono, color: 'var(--amp-go)' }}>
                {l.state === 'yes' ? 'Pinpointed' : 'Partly'}
              </p>
              <p style={{ fontWeight: 'var(--amp-weight-bold)', marginTop: 'var(--amp-space-1)' }}>{l.pattern.name}</p>
              <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)', marginTop: 'var(--amp-space-1)' }}>{l.pattern.line}</p>
            </div>
          ))}
          {out.length > 0 && (
            <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>
              Ruled out: {out.map((l) => l.pattern.name.charAt(0).toLowerCase() + l.pattern.name.slice(1)).join(', ')}.
            </p>
          )}
          {view.found.length > 0 && <PatternMap answers={answers} leads={view.found} title={`Pinpointed: ${view.found.map((l) => l.pattern.name).join(', ')}`} />}
        </div>
      )
      break
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-3)' }}>
      {round && view.kind !== 'intro' && (
        <div className="flex items-center justify-between" style={{ gap: 'var(--amp-space-2)' }}>
          <p className="uppercase" style={{ ...mono, color: 'var(--amp-ink-3)' }} aria-live="polite">
            {view.kind === 'probe' ? `Question ${view.number} · up to ${LIMITS.questions}` : view.kind === 'hunch' ? 'I think I’ve got something' : view.kind === 'done' ? `${asked} question${asked === 1 ? '' : 's'}` : 'Checkpoint'}
          </p>
          <button
            type="button"
            onClick={() => setSheet(true)}
            className="amp-press inline-flex items-center uppercase"
            aria-label={`What I’m thinking: ${contenders.length} lead${contenders.length === 1 ? '' : 's'}`}
            style={{ ...mono, gap: 'var(--amp-space-1)', minHeight: 'var(--amp-target)', padding: '0 var(--amp-space-3)', borderRadius: 'var(--amp-radius-pill)', border: 'var(--amp-hairline) solid var(--amp-accent-line)', color: 'var(--amp-accent)', whiteSpace: 'nowrap' }}
          >
            Leads · {contenders.length}
          </button>
        </div>
      )}
      {!round && view.kind === 'probe' && (
        <p className="uppercase" style={{ ...mono, color: 'var(--amp-accent)' }}>
          Quick follow-up
        </p>
      )}
      <div key={viewKey} className="amp-anim-rise">
        {body}
      </div>
      {sheet && <LeadsSheet leads={leads} onClose={() => setSheet(false)} onBuild={buildNow ? () => (setSheet(false), buildNow()) : undefined} />}
      <span className="sr-only" aria-live="polite">
        {view.kind === 'hunch' ? `Amp’s lead: ${view.lead.pattern.name}` : ''}
      </span>
    </div>
  )
}
