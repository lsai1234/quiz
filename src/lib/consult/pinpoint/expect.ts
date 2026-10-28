/**
 * How many questions Pinpoint expects to ask (Amp Consult and offer plan,
 * Phase 6): the {n} in "About {n} quick questions and I'll know for sure".
 *
 * The model's own expectation, read off the model rather than guessed: play
 * the round forward a few times from where the answers are now, each time as
 * someone the model thinks this person might be (each lead true with its
 * current p), answering every question the way the model says such a person
 * would. The average number of screens that ask something, questions and
 * hunches together, is the expectation.
 *
 * It reads the model and changes nothing in it: the priors, pulls, thresholds
 * and the choice of question are `choose.ts`'s and `model.ts`'s. Seeded, so
 * the same answers always give the same number.
 */

import { LIMITS, nextStep } from './choose'
import { EMPTY_PINPOINT, eligiblePatterns, leads } from './leads'
import type { Answers, PatternId, PinpointStage, PinpointStep, Probe } from './types'

const STAGES: PinpointStage[] = ['follow-move', 'follow-rest', 'follow-fuel', 'pinpoint']

/** mulberry32: small, seeded, deterministic. */
function rng(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** The option someone with these patterns (and none of the others) picks, drawn from the model's own likelihoods. */
function draw(probe: Probe, item: number, truth: Set<PatternId>, eligible: Set<PatternId>, rand: () => number): number {
  const options = probe.items[item].options
  const weights = options.map((o, i) => {
    let pull = 0
    for (const [id, v] of Object.entries(o.pulls) as [PatternId, number | undefined][]) {
      if (v && eligible.has(id)) pull += truth.has(id) ? v : -v
    }
    return probe.items[item].base[i] * Math.exp(pull)
  })
  let r = rand() * weights.reduce((s, w) => s + w, 0)
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return i
  }
  return weights.length - 1
}

/** One play-through: the screens that ask something. */
function playOnce(start: Answers, rand: () => number): number {
  const eligible = new Set(eligiblePatterns(start).map((p) => p.id))
  const truth = new Set(leads(start).filter((l) => rand() < l.p).map((l) => l.pattern.id))
  let a = start
  let asked = 0
  const push = (step: PinpointStep) => {
    a = { ...a, pinpoint: { steps: [...(a.pinpoint?.steps ?? []), step], stopped: false } }
  }
  for (const stage of STAGES) {
    for (let guard = 0; guard <= LIMITS.questions + LIMITS.maxPinned * 2; guard++) {
      const step = nextStep(a, stage)
      if (step.kind === 'done') break
      if (step.kind === 'checkpoint') {
        push({ kind: 'checkpoint', choice: 'more', stage: 'pinpoint' })
        continue
      }
      asked++
      if (step.kind === 'hunch') {
        push({ kind: 'verdict', pattern: step.lead.pattern.id, verdict: truth.has(step.lead.pattern.id) ? 'yes' : 'no', stage: 'pinpoint' })
        continue
      }
      const answer: Record<string, string> = {}
      let minutes: number | undefined
      step.probe.items.forEach((item, i) => {
        const o = draw(step.probe, i, truth, eligible, rand)
        answer[item.key] = item.options[o].key
        const line = step.probe.dayLine
        if (line) {
          const b = line.buckets.findIndex((x) => x.key === item.options[o].key)
          if (b >= 0) minutes = Math.round(((b === 0 ? line.from : line.buckets[b - 1].until) + line.buckets[b].until) / 2 / 30) * 30
        }
      })
      push({ kind: 'probe', probe: step.probe.id, answer, minutes, stage })
    }
  }
  return asked
}

/**
 * The questions Pinpoint expects to ask from here, if they take it: at least
 * one (the hunch itself). Answers on another route are read as if they had
 * just switched to Pinpoint, every answer kept.
 */
export function expectedQuestions(a: Answers, samples = 8): number {
  const start: Answers = { ...a, route: 'pinpoint', pinpoint: a.pinpoint ?? EMPTY_PINPOINT }
  let total = 0
  for (let s = 0; s < samples; s++) total += playOnce(start, rng(0x9e3779b1 + s * 7919))
  return Math.max(1, Math.round(total / samples))
}
