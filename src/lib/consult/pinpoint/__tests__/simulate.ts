/**
 * Simulated people for the 20 Questions test (plan v5 §10.5).
 *
 * Each has core answers that fit their hidden patterns, and answers every
 * probe the way the model says someone with those patterns (and without the
 * others) would, with one answer in ten picked at random. At a hunch they say
 * "That's me" only if it's really one of theirs.
 */

import { EMPTY_ANSWERS, type ConsultAnswers } from '../../types'
import { trainingDays } from '../../training'
import { nextStep, type NextStep } from '../choose'
import { eligiblePatterns } from '../leads'
import type { PatternId, PinpointStage, PinpointStep, Probe } from '../types'

/** mulberry32: small, seeded, deterministic. */
export function rng(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export type JourneyKey = 'builder' | 'ager' | 'everyday' | 'weight'

const VARIED = ['oily-fish', 'poultry', 'eggs', 'dairy', 'greens', 'fruit', 'wholegrains'] as ConsultAnswers['plate']

export const CORE: Record<JourneyKey, Partial<ConsultAnswers>> = {
  builder: {
    goals: ['performance'], age: '18-24', sex: 'male', aim: 'muscle', intensity: 'steady',
    training: trainingDays(['gym', 'rest', 'gym', 'rest', 'gym', 'rest', 'rest']),
    energy: 6, sleep: { bed: 23 * 60, wake: 7 * 60, quality: 'ok' }, daylight: 'most',
    caffeine: { coffee: 1, tea: 0, energy: 0 }, plate: VARIED, body: [], shelf: [],
  },
  ager: {
    goals: ['ageing'], age: '65-plus', sex: 'female', comfort: true,
    training: trainingDays(['cardio', 'rest', 'cardio', 'rest', 'cardio', 'rest', 'rest']),
    energy: 6, sleep: { bed: 22 * 60 + 30, wake: 6 * 60 + 30, quality: 'ok' }, daylight: 'most',
    caffeine: { coffee: 0, tea: 2, energy: 0 }, plate: VARIED, body: [], changes: [], shelf: [],
  },
  everyday: {
    goals: ['energy'], age: '35-44', sex: 'female',
    training: trainingDays(['gym', 'rest', 'rest', 'cardio', 'rest', 'rest', 'rest']),
    energy: 6, sleep: { bed: 23 * 60, wake: 7 * 60, quality: 'ok' }, daylight: 'most',
    caffeine: { coffee: 2, tea: 0, energy: 0 }, plate: VARIED, body: [], shelf: [],
  },
  weight: {
    goals: ['weight', 'energy'], age: '45-54', sex: 'female',
    training: trainingDays(['cardio', 'rest', 'rest', 'cardio', 'rest', 'rest', 'rest']),
    energy: 6, sleep: { bed: 23 * 60, wake: 7 * 60, quality: 'ok' }, daylight: 'most',
    caffeine: { coffee: 2, tea: 0, energy: 0 }, plate: VARIED, body: [], shelf: [],
  },
}

/** Core answers someone with the pattern would plausibly give. */
export const TELLS: Record<PatternId, (j: JourneyKey) => Partial<ConsultAnswers>> = {
  crash: () => ({ energy: 4 }),
  wired: () => ({ caffeine: { coffee: 4, tea: 0, energy: 0 }, sleep: { bed: 23 * 60, wake: 6 * 60 + 30, quality: 'broken' } }),
  'short-sleep': () => ({ sleep: { bed: 30, wake: 6 * 60 + 30, quality: 'ok' } }),
  empty: (j) => ({ energy: 4, plate: ['poultry', 'wholegrains', 'fruit'], ...(j === 'builder' ? { training: trainingDays(['gym', 'gym', 'rest', 'gym', 'gym', 'cardio', 'rest']) } : {}) }),
  'protein-gap': () => ({ plate: ['wholegrains', 'greens', 'fruit', 'dairy'] }),
  'not-recovering': () => ({ training: trainingDays(['gym', 'gym', 'rest', 'gym', 'gym', 'gym', 'rest']), intensity: 'hard' }),
  'caffeine-train': () => ({ shelf: ['pre-workout'], caffeine: { coffee: 3, tea: 0, energy: 0 } }),
  sweat: () => ({ aim: 'endurance', training: trainingDays(['cardio', 'rest', 'cardio', 'gym', 'rest', 'cardio', 'rest']) }),
  'plant-gap': () => ({ plate: ['beans', 'greens', 'fruit', 'nuts', 'wholegrains'], training: trainingDays(['gym', 'rest', 'gym', 'rest', 'cardio', 'rest', 'rest']) }),
  indoor: () => ({ daylight: 'hardly' }),
  'weekend-warrior': () => ({ training: trainingDays(['rest', 'rest', 'gym', 'rest', 'rest', 'sport', 'rest']) }),
  'stiff-starter': () => ({ body: ['knees'], changes: ['getting-about'] }),
  'keeping-strong': () => ({ changes: ['strength'] }),
  'staying-sharp': (j) => (j === 'ager' ? { changes: ['staying-sharp'] } : { goals: ['focus', 'energy'] }),
  'broken-nights': () => ({ sleep: { bed: 22 * 60 + 30, wake: 6 * 60 + 30, quality: 'broken' }, changes: ['sleeping-through'] }),
  'eating-less': () => ({ energy: 4, plate: ['dairy', 'fruit', 'wholegrains'] }),
}

/**
 * Patterns that come along with another in real life: someone running on
 * empty crashes at 3pm too, and would say "That's me" to both.
 */
export const COMES_WITH: Partial<Record<PatternId, PatternId[]>> = {
  empty: ['crash'],
  wired: ['crash'],
  'eating-less': ['crash', 'protein-gap'],
  'plant-gap': ['protein-gap'],
  'keeping-strong': ['protein-gap'],
}

/** Everything that's true for someone whose main patterns are these. */
export function truthFor(main: PatternId[]): PatternId[] {
  return [...new Set(main.flatMap((id) => [id, ...(COMES_WITH[id] ?? [])]))]
}

export function personFor(journey: JourneyKey, truth: PatternId[]): ConsultAnswers {
  let a: ConsultAnswers = { ...EMPTY_ANSWERS, route: 'pinpoint', comfortOffered: true, ...CORE[journey] }
  for (const id of truth) {
    const tell = TELLS[id](journey)
    // Changes accumulate rather than replace.
    const changes = tell.changes && a.changes ? [...new Set([...a.changes, ...tell.changes])] : tell.changes ?? a.changes
    a = { ...a, ...tell, changes }
  }
  return { ...a, pinpoint: { steps: [], stopped: false } }
}

/**
 * The answer this person gives to one item. People answer from what's true
 * for them: if any of their patterns bears on the item, they answer as those
 * patterns would; if none does, they answer as someone none of them fits.
 */
function pickOption(probe: Probe, itemIndex: number, truth: Set<PatternId>, eligible: Set<PatternId>, rand: () => number, noise: number): number {
  const item = probe.items[itemIndex]
  if (rand() < noise) return Math.floor(rand() * item.options.length)
  const linked = new Set<PatternId>()
  for (const o of item.options) for (const id of Object.keys(o.pulls) as PatternId[]) if (eligible.has(id) && o.pulls[id]) linked.add(id)
  const mine = [...linked].filter((id) => truth.has(id))
  const weights = item.options.map((o, i) => {
    const pull = mine.length ? mine.reduce((s, id) => s + (o.pulls[id] ?? 0), 0) : -[...linked].reduce((s, id) => s + (o.pulls[id] ?? 0), 0)
    return item.base[i] * Math.exp(pull)
  })
  const total = weights.reduce((s, w) => s + w, 0)
  let r = rand() * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return i
  }
  return weights.length - 1
}

export interface Run {
  answers: ConsultAnswers
  asked: string[]
  /** Probes asked when each pattern was confirmed. */
  confirmedAt: Partial<Record<PatternId, number>>
  hunches: { pattern: PatternId; true: boolean }[]
  done: NextStep
}

const STAGES: PinpointStage[] = ['follow-move', 'follow-rest', 'follow-fuel', 'pinpoint']

/** Run a whole Pinpoint for a simulated person. */
export function simulate(start: ConsultAnswers, truth: PatternId[], seed: number, noise = 0.1): Run {
  const rand = rng(seed)
  const truthSet = new Set(truth)
  let a = start
  const eligible = new Set(eligiblePatterns(a).map((p) => p.id))
  const asked: string[] = []
  const confirmedAt: Run['confirmedAt'] = {}
  const hunches: Run['hunches'] = []
  const push = (step: PinpointStep) => {
    a = { ...a, pinpoint: { steps: [...(a.pinpoint?.steps ?? []), step], stopped: a.pinpoint?.stopped ?? false } }
  }
  let last: NextStep = { kind: 'done', reason: 'settled' }
  for (const stage of STAGES) {
    for (let guard = 0; guard < 60; guard++) {
      const step = nextStep(a, stage)
      last = step
      if (step.kind === 'done') break
      if (step.kind === 'checkpoint') {
        push({ kind: 'checkpoint', choice: 'more', stage: 'pinpoint' })
        continue
      }
      if (step.kind === 'hunch') {
        const yes = truthSet.has(step.lead.pattern.id)
        hunches.push({ pattern: step.lead.pattern.id, true: yes })
        if (yes) confirmedAt[step.lead.pattern.id] = asked.length
        push({ kind: 'verdict', pattern: step.lead.pattern.id, verdict: yes ? 'yes' : 'no', stage: 'pinpoint' })
        continue
      }
      const probe = step.probe
      asked.push(probe.id)
      const answer: Record<string, string> = {}
      let minutes: number | undefined
      probe.items.forEach((item, i) => {
        const o = pickOption(probe, i, truthSet, eligible, rand, noise)
        answer[item.key] = item.options[o].key
        if (probe.dayLine) {
          const b = probe.dayLine.buckets.findIndex((x) => x.key === item.options[o].key)
          if (b >= 0) {
            const from = b === 0 ? probe.dayLine.from : probe.dayLine.buckets[b - 1].until
            minutes = Math.round((from + probe.dayLine.buckets[b].until) / 2 / 30) * 30
          }
        }
      })
      push({ kind: 'probe', probe: probe.id, answer, minutes, stage })
    }
  }
  return { answers: a, asked, confirmedAt, hunches, done: last }
}
