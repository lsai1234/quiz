/**
 * What a Pinpoint screen shows, from the answers alone (plan v5 §5).
 *
 * The shell's heading and Amp's reaction line, and the scene's content, all
 * come from here, so they can't disagree, and a resumed consult lands on
 * exactly the same screen.
 */

import { nextStep, questionsLeft, type NextStep } from './choose'
import { pinpointed } from './effects'
import { PROBE_BY_ID } from './library'
import { EMPTY_PINPOINT, isIn, leads, probeSteps, type Lead } from './leads'
import { VERDICT_LINE, pinpointReaction } from './playback'
import type { Answers, PinpointStage, PinpointStep, Probe } from './types'

export type PinpointView =
  | { kind: 'intro'; heading: string; hint: string }
  | {
      kind: 'probe'
      heading: string
      hint?: string
      probe: Probe
      /** The scenario, resolved for this person. */
      text: string
      /** 1-based, all stages together. */
      number: number
      tells: string[]
      /** A follow-up already answered, shown again with its answer. */
      answered?: Extract<PinpointStep, { kind: 'probe' }>
    }
  | { kind: 'hunch'; heading: string; hint: string; lead: Lead }
  | { kind: 'checkpoint'; heading: string; hint: string }
  | { kind: 'done'; heading: string; hint: string; found: Lead[] }

export function probeText(probe: Probe, a: Answers): string {
  return typeof probe.text === 'function' ? probe.text(a) : probe.text ?? ''
}

function probeView(probe: Probe, a: Answers, stage: PinpointStage, tells: string[], answered?: Extract<PinpointStep, { kind: 'probe' }>): PinpointView {
  const asked = probeSteps(a.pinpoint)
  const number = answered ? asked.indexOf(answered) + 1 : asked.length + 1
  const follow = stage !== 'pinpoint'
  const own = probe.format === 'day-line' || probe.format === 'quick-fire' ? probeText(probe, a) : undefined
  return {
    kind: 'probe',
    heading: probe.question,
    hint: follow ? own ?? 'Quick follow-up. One tap, then I’ll move on.' : own,
    probe,
    text: probeText(probe, a),
    number,
    tells,
    answered,
  }
}

export function pinpointView(stage: PinpointStage, a: Answers): PinpointView {
  const pp = a.pinpoint ?? EMPTY_PINPOINT
  if (stage !== 'pinpoint') {
    const answered = probeSteps(pp).find((s) => s.stage === stage)
    if (answered && PROBE_BY_ID[answered.probe]) return probeView(PROBE_BY_ID[answered.probe], a, stage, [], answered)
    const step = nextStep(a, stage)
    if (step.kind === 'probe') return probeView(step.probe, a, stage, step.tells)
    return { kind: 'done', heading: 'Quick follow-up', hint: 'Nothing to ask here. On we go.', found: [] }
  }
  const step: NextStep = nextStep(a, 'pinpoint')
  const inRound = pp.steps.some((s) => s.stage === 'pinpoint')
  if (!pp.started && !inRound && step.kind !== 'done') {
    const left = questionsLeft(a)
    return { kind: 'intro', heading: 'Here’s what I’ve got so far', hint: `Let’s pin it down. Usually about ${left} question${left === 1 ? '' : 's'}, 20 at most.` }
  }
  switch (step.kind) {
    case 'probe':
      return probeView(step.probe, a, 'pinpoint', step.tells)
    case 'hunch':
      return { kind: 'hunch', heading: step.lead.pattern.name, hint: step.lead.pattern.line, lead: step.lead }
    case 'checkpoint': {
      const strong = leads(a).filter((l) => isIn(l) && l.p >= 0.5).length
      return {
        kind: 'checkpoint',
        heading: 'Nearly there',
        hint: strong
          ? `${strong === 1 ? 'One lead' : `${strong} leads`} still worth checking. A few more questions, or build your stack now?`
          : 'A few more questions to be sure, or build your stack now?',
      }
    }
    case 'done': {
      const found = pinpointed(a)
      return found.length
        ? { kind: 'done', heading: 'Pinpointed', hint: 'Here’s what I found. Next, a quick safety check.', found }
        : { kind: 'done', heading: 'Nothing stood out', hint: 'You’re in decent shape. I’ll keep your stack to the basics.', found }
    }
  }
}

/** Amp's line on arrival at this screen: hot and cold after an answer, or the verdict's line. */
export function pinpointReactionLine(stage: PinpointStage, a: Answers): string | undefined {
  const steps = a.pinpoint?.steps ?? []
  const last = steps[steps.length - 1]
  if (!last || last.stage !== stage || stage !== 'pinpoint') return undefined
  if (last.kind === 'verdict') return VERDICT_LINE[last.verdict]
  if (last.kind !== 'probe') return undefined
  const before = { ...a, pinpoint: { ...(a.pinpoint ?? EMPTY_PINPOINT), steps: steps.slice(0, -1) } }
  return last.unsure ? 'No problem. Moving on.' : pinpointReaction(before, a)
}

/** The answers with one more step. */
export function withStep(a: Answers, step: PinpointStep): Answers['pinpoint'] {
  const pp = a.pinpoint ?? EMPTY_PINPOINT
  return { ...pp, steps: [...pp.steps, step] }
}

/** A follow-up's answer, replaced (changed on a second visit). */
export function replaceFollowUp(a: Answers, stage: PinpointStage, step: PinpointStep): Answers['pinpoint'] {
  const pp = a.pinpoint ?? EMPTY_PINPOINT
  return { ...pp, steps: [...pp.steps.filter((s) => s.stage !== stage), step] }
}

/** The round's last step taken back (Back inside the round). Null when there's nothing to take back. */
export function undoInRound(a: Answers): Answers['pinpoint'] | null {
  const pp = a.pinpoint ?? EMPTY_PINPOINT
  const last = pp.steps[pp.steps.length - 1]
  if (pp.stopped) return { ...pp, stopped: false }
  if (!last || last.stage !== 'pinpoint') return pp.started ? { ...pp, started: false } : null
  return { ...pp, steps: pp.steps.slice(0, -1) }
}

/** How many questions asked so far, all stages. */
export function questionsAsked(a: Answers): number {
  return probeSteps(a.pinpoint).length
}
