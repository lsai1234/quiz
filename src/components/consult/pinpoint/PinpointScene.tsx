'use client'

import { useEffect, useRef, useState } from 'react'
import { LIMITS } from '@/lib/consult/pinpoint/choose'
import { EMPTY_PINPOINT, isOut, leads as allLeads } from '@/lib/consult/pinpoint/leads'
import { justRuledOut, pinpointView, questionsAsked, replaceFollowUp, withStep } from '@/lib/consult/pinpoint/screen'
import { questionsLeft } from '@/lib/consult/pinpoint/choose'
import { whyAsking } from '@/lib/consult/pinpoint/playback'
import type { PatternId, PinpointStage } from '@/lib/consult/pinpoint/types'
import { haptic } from '@/lib/consult/motion'
import { NextButton, QuietLink } from '../controls'
import type { SceneProps } from '../scenes/registry'
import { ProbeFormat, type ProbeAnswer } from './formats'
import { HunchCard, LeadBars, LeadsSheet, PatternMap, Plain } from './parts'
import { wordedProbe, TELLABLE_FORMATS, type ProbePick, type ProbeWords } from '@/lib/consult/ai/pinpoint'
import { foundLine, probeWords, tellCandidates } from './pinpointAi'
import { TellSheet } from './TellSheet'

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
  fontFamily: 'var(--amp-font-label)',
  fontSize: 'var(--amp-text-data)',
  letterSpacing: 'var(--amp-tracking-data)',
} as const

/** "about 3 more": what Amp expects the round still needs. */
function counterTail(left: number): string {
  if (left <= 0) return 'nearly there'
  return left === 1 ? 'about 1 more' : `about ${left} more`
}

export function PinpointScene({ scene, answers, onAnswer, comfort, onNext, ai }: SceneProps) {
  const stage = scene.id as PinpointStage
  const round = stage === 'pinpoint'
  const view = pinpointView(stage, answers)
  const pp = answers.pinpoint ?? EMPTY_PINPOINT
  const [pending, setPending] = useState<ProbeAnswer | null>(null)
  const [sheet, setSheet] = useState(false)
  const [why, setWhy] = useState(false)
  /** Typing open: a bad day before the round, or "it's more complicated" on a question. */
  const [typing, setTyping] = useState<'bad-day' | 'complicated' | null>(null)
  /** How many answers the last typed text filled, said once. */
  const [told, setTold] = useState(0)
  const leads = allLeads(answers)
  const asked = questionsAsked(answers)
  const write = (next: typeof pp) => onAnswer({ pinpoint: next })

  const viewKey = view.kind === 'probe' ? `probe:${view.probe.id}` : view.kind === 'hunch' ? `hunch:${view.lead.pattern.id}` : view.kind
  // The AI's words for this question, only if they were in hand when it appeared.
  const locked = useRef<{ key: string; words: ProbeWords | null }>({ key: '', words: null })
  if (locked.current.key !== viewKey) locked.current = { key: viewKey, words: ai && view.kind === 'probe' ? probeWords(view.probe, answers) : null }
  const aiWords = locked.current.words
  const first = useRef(true)
  useEffect(() => {
    setPending(null)
    setWhy(false)
    // A new question in the round: the heading takes focus, as on a new scene.
    if (first.current) {
      first.current = false
      return
    }
    if (round) document.querySelector<HTMLElement>('.amp-consult h1')?.focus({ preventScroll: true })
    // A hunch forming gets a double tick, where the phone can.
    if (view.kind === 'hunch') haptic('double')
    // Only when the screen changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, round])

  /** Typed answers become steps, in the round, marked as told. */
  function applyTold(picks: ProbePick[]) {
    setTyping(null)
    const steps = picks.map((p) => ({ kind: 'probe' as const, probe: p.probe, answer: { main: p.answer }, told: true, stage: 'pinpoint' as const }))
    setTold(steps.length)
    write({ ...pp, started: true, steps: [...pp.steps, ...steps] })
  }

  function commit(p: ProbeAnswer | { unsure: true }) {
    if (view.kind !== 'probe') return
    const step = 'unsure' in p ? { kind: 'probe' as const, probe: view.probe.id, answer: {}, unsure: true, stage } : { kind: 'probe' as const, probe: view.probe.id, answer: p.answer, minutes: p.minutes, stage }
    setPending(null)
    setTold(0)
    if (round) {
      write(withStep(answers, step)!)
    } else {
      write(replaceFollowUp(answers, stage, step)!)
      onNext?.()
    }
  }

  const buildNow = round && asked >= LIMITS.buildNowFrom ? () => write({ ...pp, stopped: true }) : undefined
  const gone = justRuledOut(stage, answers)
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
          {ai && (
            <div className="flex justify-center">
              <QuietLink icon="spark" onClick={() => setTyping('bad-day')}>
                Or tell me about a bad day
              </QuietLink>
            </div>
          )}
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
            probe={wordedProbe(view.probe, aiWords)}
            text={aiWords?.text ?? view.text}
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
            {view.tells.length > 0 && (
              <QuietLink aria-expanded={why} onClick={() => setWhy((w) => !w)}>
                Why I’m asking
              </QuietLink>
            )}
            {ai && TELLABLE_FORMATS.has(view.probe.format) && <QuietLink onClick={() => setTyping('complicated')}>It’s more complicated</QuietLink>}
            {buildNow && <QuietLink onClick={buildNow}>Build my stack now</QuietLink>}
          </div>
          {why && (
            <p className="amp-anim-rise text-center" style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>
              {whyAsking(view.tells as PatternId[])}
            </p>
          )}
        </div>
      )
      break
    }
    case 'hunch':
      body = (
        <HunchCard
          lead={view.lead}
          comfort={comfort}
          onVerdict={(verdict) => {
            if (verdict === 'yes') haptic('charge')
            write(withStep(answers, { kind: 'verdict', pattern: view.lead.pattern.id, verdict, stage: 'pinpoint' })!)
          }}
        />
      )
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
      const summary = ai ? foundLine(answers) : null
      body = (
        <div className="flex flex-col" style={{ gap: 'var(--amp-space-3)' }}>
          {summary && (
            <p className="amp-anim-rise" style={{ color: 'var(--amp-ink)' }}>
              {summary}
            </p>
          )}
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
          <p className="uppercase" style={{ ...mono, color: 'var(--amp-ink-3)' }} aria-live="polite" data-counter>
            {view.kind === 'probe' ? (
              // Two halves that each keep together, so a big-text wrap breaks between them.
              <>
                <span className="whitespace-nowrap">Question {view.number} ·</span> <span className="whitespace-nowrap">{counterTail(questionsLeft(answers))}</span>
              </>
            ) : view.kind === 'hunch' ? (
              'Amp’s hunch'
            ) : view.kind === 'done' ? (
              `${asked} question${asked === 1 ? '' : 's'}`
            ) : (
              'Checkpoint'
            )}
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
      {round && gone.length > 0 && (
        <p className="flex flex-wrap items-center" style={{ gap: 'var(--amp-space-1)' }} aria-live="polite">
          {gone.map((l) => (
            <span
              key={l.pattern.id}
              className="amp-anim-rise uppercase"
              style={{ ...mono, padding: 'var(--amp-space-1) var(--amp-space-2)', borderRadius: 'var(--amp-radius-pill)', border: 'var(--amp-hairline) solid var(--amp-edge-strong)', color: 'var(--amp-ink-3)', textDecoration: 'line-through' }}
            >
              <span className="sr-only">Ruled out: </span>
              {l.pattern.name}
            </span>
          ))}
        </p>
      )}
      <div key={viewKey} className="amp-anim-rise">
        {body}
      </div>
      {round && told > 0 && view.kind !== 'intro' && (
        <p aria-live="polite" style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-accent)' }}>
          From what you told me: {told === 1 ? '1 answer' : `${told} answers`} filled in.
        </p>
      )}
      {typing === 'bad-day' && (
        <TellSheet
          title="Tell me about a bad day"
          prompt="What does a day that leaves you flat look like? Mornings, afternoons, evenings: whatever comes to mind."
          example="e.g. I’m dragging by 3pm, have a couple of coffees to get through, then I’m wide awake at midnight"
          candidates={tellCandidates(answers)}
          answers={answers}
          nothing="I couldn’t match that to anything yet. Let’s go through it together."
          onPicks={applyTold}
          onClose={() => setTyping(null)}
        />
      )}
      {typing === 'complicated' && view.kind === 'probe' && (
        <TellSheet
          title="It’s more complicated"
          prompt="Tell me how it really is, and I’ll pick the closest answer."
          example="e.g. only on days I’ve trained in the morning"
          candidates={[view.probe.id]}
          answers={answers}
          nothing="I couldn’t match that to an answer. Pick the closest one, or Not sure."
          onPicks={(picks) => {
            setTyping(null)
            const p = picks.find((x) => x.probe === view.probe.id)
            if (p) commit({ answer: { main: p.answer } })
          }}
          onClose={() => setTyping(null)}
        />
      )}
      {sheet && <LeadsSheet leads={leads} onClose={() => setSheet(false)} onBuild={buildNow ? () => (setSheet(false), buildNow()) : undefined} />}
      <span className="sr-only" aria-live="polite">
        {view.kind === 'hunch' ? `Amp’s lead: ${view.lead.pattern.name}` : ''}
      </span>
    </div>
  )
}
