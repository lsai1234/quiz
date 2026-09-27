/**
 * What Amp asks next (plan v5 §4.3).
 *
 * The round: check a "Partly" first, then any lead strong enough to put to the
 * person, then stop if there's nothing worth asking — otherwise the probe
 * expected to settle the most. Follow-ups inside the core screens ask one
 * probe from that section, and only when it's clearly worth it.
 *
 * Pure: the same answers always give the same next step, which is what lets a
 * saved consult resume on exactly the right question.
 */

import { entropy, itemGain } from './model'
import { PROBE_BY_ID } from './library'
import { askableProbes, directSupport, eligiblePatterns, isIn, leads, probeSteps, touches, type Lead } from './leads'
import type { Answers, PatternId, PinpointArea, PinpointStage, Probe, ProbeFormat } from './types'

export const LIMITS = {
  /** Probes, all stages together. */
  questions: 20,
  checkpointAt: 10,
  /** "Build my stack now" appears from this probe. */
  buildNowFrom: 5,
  maxPinned: 3,
  hunchAt: 0.75,
  /** When nothing's left to ask, a backed lead this strong still gets a final guess. */
  finalGuessAt: 0.6,
  /** A hunch needs this much behind it, with at least one scenario answer among it. */
  hunchEvidence: 2,
  /** Stop when the best probe left would settle less than this, in bits. */
  stopGain: 0.05,
  /** A follow-up inside the core screens has to be worth at least this. */
  followUpGain: 0.25,
  /** Only leads at least this likely are worth asking about. Below it, a pattern needs a core answer to put it in play. */
  contender: 0.25,
} as const

export const STAGE_AREA: Record<Exclude<PinpointStage, 'pinpoint'>, PinpointArea> = {
  'follow-move': 'move',
  'follow-rest': 'rest',
  'follow-fuel': 'fuel',
}

export type DoneReason = 'pinned' | 'limit' | 'settled' | 'stopped'

export type NextStep =
  | { kind: 'probe'; probe: Probe; gain: number; /** The leads it mostly separates, for "Why I'm asking". */ tells: PatternId[] }
  | { kind: 'hunch'; lead: Lead }
  | { kind: 'checkpoint' }
  | { kind: 'done'; reason: DoneReason }

interface Scored {
  probe: Probe
  gain: number
  parts: [PatternId, number][]
}

/** Expected bits a probe would settle, over the leads given. */
function score(probe: Probe, among: Lead[]): Scored {
  const parts: [PatternId, number][] = []
  let gain = 0
  for (const lead of among) {
    let g = 0
    for (const item of probe.items) g += itemGain(item, lead.pattern.id, lead.p)
    if (g > 0) {
      parts.push([lead.pattern.id, g])
      gain += g
    }
  }
  parts.sort((x, y) => y[1] - x[1])
  return { probe, gain, parts }
}

function best(candidates: Probe[], among: Lead[], lastFormats: ProbeFormat[]): Scored | null {
  const scored = candidates.map((p) => score(p, among)).filter((s) => s.gain > 0)
  if (!scored.length) return null
  // Variety: never the same format three times running, if anything else is worth asking.
  const repeat = lastFormats.length >= 2 && lastFormats[0] === lastFormats[1] ? lastFormats[0] : null
  const varied = repeat ? scored.filter((s) => s.probe.format !== repeat) : scored
  const pool = varied.length ? varied : scored
  // Highest gain; ties break on library order, so it's deterministic.
  return pool.reduce((a, b) => (b.gain > a.gain + 1e-9 ? b : a))
}

/**
 * Enough behind a lead to put it to the person: an answer to a question
 * mainly about it, and one more thing (another answer, or a core screen).
 */
const backed = (l: Lead) => directSupport(l) >= 1 && l.support.length >= LIMITS.hunchEvidence

/** In play and plausible: the leads worth spending questions on. */
const contender = (l: Lead) => l.state === 'checking' || (l.state === 'live' && l.p >= LIMITS.contender)

function toProbe(s: Scored): NextStep {
  return { kind: 'probe', probe: s.probe, gain: s.gain, tells: s.parts.slice(0, 2).map(([id]) => id) }
}

export function nextStep(a: Answers, stage: PinpointStage): NextStep {
  const pp = a.pinpoint
  const asked = probeSteps(pp)
  const askedIds = new Set(asked.map((s) => s.probe))
  const lastFormats = asked
    .slice(-2)
    .reverse()
    .map((s) => PROBE_BY_ID[s.probe]?.format)
    .filter((f): f is ProbeFormat => Boolean(f))
  const all = leads(a)
  const open = askableProbes(a, eligiblePatterns(a)).filter((p) => !askedIds.has(p.id))

  if (stage !== 'pinpoint') {
    if (asked.some((s) => s.stage === stage)) return { kind: 'done', reason: 'settled' }
    if (asked.length >= LIMITS.questions) return { kind: 'done', reason: 'limit' }
    const area = STAGE_AREA[stage]
    const pick = best(open.filter((p) => p.area === area), all.filter(contender), lastFormats)
    return pick && pick.gain >= LIMITS.followUpGain ? toProbe(pick) : { kind: 'done', reason: 'settled' }
  }

  if (pp?.stopped) return { kind: 'done', reason: 'stopped' }

  // "Partly": one more question about that pattern before anything else.
  const checking = all.find((l) => l.state === 'checking')
  if (checking) {
    const pick = best(open.filter((p) => touches(p, checking.pattern.id)), [checking], lastFormats)
    if (pick) return toProbe(pick)
  }

  // A lead strong enough, backed by enough answers, is put to the person.
  const hunch = all.filter((l) => l.state === 'live' && l.p >= LIMITS.hunchAt && backed(l)).sort((x, y) => y.p - x.p)[0]
  if (hunch) return { kind: 'hunch', lead: hunch }

  // A strong lead that no scenario has backed yet gets one to back it or
  // knock it down: Amp never finishes on a hunch it hasn't checked.
  const unbacked = all.filter((l) => l.state === 'live' && l.p >= LIMITS.hunchAt && !backed(l)).sort((x, y) => y.p - x.p)[0]
  if (unbacked && asked.length < LIMITS.questions) {
    const pick = best(open.filter((p) => touches(p, unbacked.pattern.id)), [unbacked], lastFormats)
    if (pick) return toProbe(pick)
  }

  if (all.filter((l) => l.state === 'yes').length >= LIMITS.maxPinned) return { kind: 'done', reason: 'pinned' }

  const pick = asked.length < LIMITS.questions ? best(open, all.filter(contender), lastFormats) : null
  if (!pick || pick.gain < LIMITS.stopGain) {
    // Like the ball's last guess: out of useful questions, Amp still asks
    // about the best lead it has, rather than finishing on a maybe.
    const guess = all.filter((l) => l.state === 'live' && l.p >= LIMITS.finalGuessAt && backed(l)).sort((x, y) => y.p - x.p)[0]
    if (guess) return { kind: 'hunch', lead: guess }
    return { kind: 'done', reason: asked.length >= LIMITS.questions ? 'limit' : 'settled' }
  }

  const hadCheckpoint = (pp?.steps ?? []).some((s) => s.kind === 'checkpoint')
  if (asked.length >= LIMITS.checkpointAt && !hadCheckpoint) return { kind: 'checkpoint' }
  return toProbe(pick)
}

/** Is the round finished? */
export function roundDone(a: Answers): boolean {
  return nextStep(a, 'pinpoint').kind === 'done'
}

/** Roughly how many more questions the round needs, for "usually about 6". */
export function questionsLeft(a: Answers): number {
  const asked = probeSteps(a.pinpoint).length
  const unsettled = leads(a).filter((l) => isIn(l) && l.p > 0.15 && l.p < LIMITS.hunchAt).length
  return Math.max(0, Math.min(LIMITS.questions - asked, Math.max(2, unsettled * 2)))
}

/** How settled Amp is, 0–1: drives the reticle. */
export function focus(a: Answers): number {
  const all = leads(a)
  if (!all.length) return 0
  const top = Math.max(...all.filter((l) => l.state !== 'no' && l.state !== 'out').map((l) => l.p), 0)
  const settled = all.reduce((s, l) => s + (1 - entropy(l.p)), 0) / all.length
  return Math.max(0, Math.min(1, 0.6 * Math.max(0, (top - 0.4) / 0.6) + 0.4 * settled))
}
