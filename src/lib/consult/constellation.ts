/**
 * Watch Amp think (Amp Consult and offer plan, Phase 7.5): the patterns in
 * play as a constellation round Amp. This file is what it shows, from the
 * answers alone; `pinpoint/Constellation.tsx` draws it.
 *
 *   node     one per eligible pattern: nearer Amp, bigger and brighter the
 *            likelier it is; ruled out, it dims and falls away
 *   pulses   after an answer, one into each pattern it moved, sized by how much
 *   splits   the patterns the current question is splitting (its information
 *            gain, from the same calculation Pinpoint chooses questions by)
 *   counter  "Narrowing it down: 9 → 4 → 2"
 *
 * Positions are fractions (distance 0 at Amp, 1 at the edge), so each size
 * lays them out its own way. Pure: reads the Pinpoint model, never changes it.
 */

import { itemGain } from './pinpoint/model'
import { LIMITS } from './pinpoint/choose'
import { eligiblePatterns, isOut, isPinned, leads, type Lead, type LeadState } from './pinpoint/leads'
import type { Answers, PatternId, PinpointStep, Probe } from './pinpoint/types'

export interface StarNode {
  id: PatternId
  name: string
  p: number
  state: LeadState
  /** Its place round Amp, fixed for the person: radians, 0 to the right, clockwise. */
  angle: number
  /** 0 at Amp, 1 at the edge. Contenders drift in; ruled out sits at the edge. */
  distance: number
  /** 0–1: size and glow. */
  weight: number
  /** Still in play and worth a label. */
  contender: boolean
}

/** A pulse only for a move at least this big (probability). */
export const PULSE_FROM = 0.02

const steps = (a: Answers): PinpointStep[] => a.pinpoint?.steps ?? []
const withSteps = (a: Answers, s: PinpointStep[]): Answers => ({ ...a, pinpoint: { ...(a.pinpoint ?? { stopped: false }), steps: s } })

function nodeFor(l: Lead, angle: number): StarNode {
  const out = isOut(l)
  const pinned = isPinned(l)
  return {
    id: l.pattern.id,
    name: l.pattern.name,
    p: l.p,
    state: l.state,
    angle,
    distance: out ? 1 : pinned ? 0.4 : 0.45 + 0.55 * (1 - l.p),
    weight: out ? 0 : pinned ? 1 : l.p,
    contender: pinned || (!out && l.p >= LIMITS.contender),
  }
}

/** Every eligible pattern, in the library's order, spread evenly round Amp from the top. */
export function constellation(a: Answers): StarNode[] {
  const all = leads(a)
  const order = eligiblePatterns(a).map((p) => p.id)
  return all.map((l) => nodeFor(l, -Math.PI / 2 + (order.indexOf(l.pattern.id) * 2 * Math.PI) / Math.max(1, order.length)))
}

/** What the last answer moved, and by how much: the pulses. Empty before the first answer. */
export function pulses(a: Answers): { id: PatternId; size: number; towards: boolean }[] {
  const s = steps(a)
  const last = s.length - 1
  if (last < 0 || (s[last].kind !== 'probe' && s[last].kind !== 'verdict')) return []
  const before = new Map(leads(withSteps(a, s.slice(0, last))).map((l) => [l.pattern.id, l.p]))
  return leads(a)
    .map((l) => ({ id: l.pattern.id, delta: l.p - (before.get(l.pattern.id) ?? l.p) }))
    .filter((m) => Math.abs(m.delta) >= PULSE_FROM)
    .map((m) => ({ id: m.id, size: Math.min(1, Math.abs(m.delta) / 0.4), towards: m.delta > 0 }))
}

/** The patterns a question is splitting: those it would settle at least a little about. */
export function splits(a: Answers, probe: Probe | null): PatternId[] {
  if (!probe) return []
  return leads(a)
    .filter((l) => !isOut(l) && !isPinned(l))
    .map((l) => ({ id: l.pattern.id, gain: probe.items.reduce((g, item) => g + itemGain(item, l.pattern.id, l.p), 0) }))
    .filter((x) => x.gain >= LIMITS.stopGain)
    .sort((x, y) => y.gain - x.gain)
    .slice(0, 4)
    .map((x) => x.id)
}

/** Still in it: pinned, or a contender (the same rule as the round's lead count). */
const possible = (ls: Lead[]) => ls.filter((l) => isPinned(l) || (!isOut(l) && l.p >= LIMITS.contender)).length

/**
 * "Narrowing it down": everything eligible, then the leads still in it after
 * the core answers and after each answer since, repeats dropped. The last
 * four, so it reads at a glance; the last is the round's lead count.
 */
export function narrowing(a: Answers): number[] {
  const s = steps(a)
  const counts = [eligiblePatterns(a).length, possible(leads(withSteps(a, [])))]
  s.forEach((step, i) => {
    if (step.kind === 'probe' || step.kind === 'verdict') counts.push(possible(leads(withSteps(a, s.slice(0, i + 1)))))
  })
  const seen = counts.filter((n, i) => i === 0 || n !== counts[i - 1])
  return seen.slice(-4)
}

export const narrowingText = (ns: number[]) => `Narrowing it down: ${ns.join(' → ')}`

/** The constellation in words: its text alternative. */
export function constellationText(nodes: StarNode[], ns: number[]): string {
  const pinned = nodes.filter((n) => n.state === 'yes' || n.state === 'partly').map((n) => n.name)
  const close = nodes.filter((n) => n.contender && !pinned.includes(n.name)).sort((x, y) => y.p - x.p).map((n) => n.name)
  const parts = [narrowingText(ns)]
  if (pinned.length) parts.push(`pinpointed: ${pinned.join(', ')}`)
  if (close.length) parts.push(`closest: ${close.join(', ')}`)
  return parts.join('. ')
}
