/**
 * Leads: every pattern's score, replayed from the answers (plan v5 §4.3).
 *
 * Nothing is stored but the answers. Each time, the scores start from the
 * pattern's prior plus nudges from the core screens (so an edit on the review
 * changes them), then every Pinpoint step is replayed in order: probe answers
 * add evidence, verdicts lock a pattern in or out. Same answers, same leads.
 */

import { journeyOf } from '../journey'
import { NUDGE, evidence, sigmoid } from './model'
import { PATTERNS, PROBES, PROBE_BY_ID } from './library'
import type { Answers, Pattern, PatternId, PinpointAnswer, PinpointStep, Probe, Strength } from './types'

/**
 *   live      still in play
 *   checking  "Partly": one more probe about it, then it settles
 *   yes       pinpointed: the person said "That's me"
 *   partly    settled after "Partly": counts, lightly
 *   no        the person said "Not me"
 *   out       ruled out by the answers
 */
export type LeadState = 'live' | 'checking' | 'yes' | 'partly' | 'no' | 'out'

export interface Evidence {
  text: string
  from: 'core' | 'answer'
  /** An answer to a question that's mainly about this pattern (its strongest pull), not a side effect of another's. */
  direct?: boolean
}

export interface Lead {
  pattern: Pattern
  /** Log-odds. */
  score: number
  /** 0–1. */
  p: number
  state: LeadState
  /** What points towards it, in the member's words. */
  support: Evidence[]
  /** The strongest thing pointing away, for "ruled out because…". */
  against: string | null
  /** How many probes have tested it. */
  tested: number
}

/** A pattern auto-rules itself out below this, once two probes have tested it. */
export const RULED_OUT_BELOW = 0.08
/** An answer counts as support when it adds at least this much. */
export const SUPPORT_AT = 0.3

export const EMPTY_PINPOINT: PinpointAnswer = { steps: [], stopped: false }

const nudgeSize = (s: Strength) => (s.startsWith('away ') ? -NUDGE[s.slice(5) as keyof typeof NUDGE] : NUDGE[s as keyof typeof NUDGE])

/** Patterns in play for this person: their journey, and any condition of the pattern's own. */
export function eligiblePatterns(a: Answers): Pattern[] {
  const journey = journeyOf(a)
  return PATTERNS.filter((p) => p.journeys.includes(journey) && (p.eligible?.(a) ?? true))
}

/** Probes that could be asked of this person: their own condition holds, and they test something in play. */
export function askableProbes(a: Answers, patterns: Pattern[] = eligiblePatterns(a)): Probe[] {
  const ids = new Set(patterns.map((p) => p.id))
  return PROBES.filter((probe) => (probe.askIf?.(a) ?? true) && probe.items.some((i) => i.options.some((o) => Object.keys(o.pulls).some((id) => ids.has(id as PatternId)))))
}

export function probeSteps(pp: PinpointAnswer | null): Extract<PinpointStep, { kind: 'probe' }>[] {
  return (pp?.steps ?? []).filter((s): s is Extract<PinpointStep, { kind: 'probe' }> => s.kind === 'probe')
}

/** Does this probe say anything about the pattern? */
export function touches(probe: Probe, id: PatternId): boolean {
  return probe.items.some((i) => i.options.some((o) => (o.pulls[id] ?? 0) !== 0))
}

export function leads(a: Answers): Lead[] {
  const patterns = eligiblePatterns(a)
  const out = patterns.map((pattern): Lead => {
    let score = pattern.prior
    const support: Evidence[] = []
    let against: { text: string; size: number } | null = null
    for (const n of pattern.nudges) {
      if (!n.when(a)) continue
      const size = nudgeSize(n.towards)
      score += size
      const text = typeof n.why === 'function' ? n.why(a) : n.why
      if (size > 0) support.push({ text, from: 'core' })
      else if (!against || size < against.size) against = { text, size }
    }
    // What the notes point to (plan v5 §7): a small nudge, and the note as
    // evidence. Never enough for a hunch on its own: that needs an answer.
    for (const h of a.noteHints ?? []) {
      if (h.pattern !== pattern.id) continue
      score += nudgeSize('a little')
      support.push({ text: `You mentioned: ${h.why.charAt(0).toLowerCase()}${h.why.slice(1)}`, from: 'core' })
    }
    return { pattern, score, p: sigmoid(score), state: 'live', support, against: against?.text ?? null, tested: 0 }
  })
  const byId = new Map(out.map((l) => [l.pattern.id, l]))
  const againstSize = new Map<Lead, number>()
  const steps = a.pinpoint?.steps ?? []

  for (const step of steps) {
    if (step.kind === 'verdict') {
      const lead = byId.get(step.pattern)
      if (!lead) continue
      if (step.verdict === 'yes') {
        lead.state = 'yes'
        lead.score = 5
      } else if (step.verdict === 'no') {
        lead.state = 'no'
        lead.score = -5
      } else {
        lead.state = 'checking'
        lead.score = Math.max(lead.score, 0)
      }
      lead.p = sigmoid(lead.score)
      continue
    }
    if (step.kind !== 'probe' || step.unsure) continue
    const probe = PROBE_BY_ID[step.probe]
    if (!probe) continue
    const moved = new Set<Lead>()
    for (const item of probe.items) {
      const index = item.options.findIndex((o) => o.key === step.answer[item.key])
      if (index < 0) continue
      const option = item.options[index]
      for (const lead of out) {
        if (lead.state !== 'live' && lead.state !== 'checking') continue
        const e = evidence(item, index, lead.pattern.id)
        if (e === 0) continue
        lead.score += e
        if (!moved.has(lead)) lead.tested += 1
        moved.add(lead)
        const said = option.said ?? (probe.dayLine && step.minutes !== undefined && e > 0 ? probe.dayLine.said(step.minutes) : undefined)
        if (e > SUPPORT_AT && said) {
          const mine = option.pulls[lead.pattern.id] ?? 0
          const direct = Object.values(option.pulls).every((v) => (v ?? 0) <= mine)
          lead.support.push({ text: said, from: 'answer', direct })
        }
        // The strongest answer pointing away becomes the "ruled out because".
        if (e < -SUPPORT_AT && option.said && e < (againstSize.get(lead) ?? 0)) {
          lead.against = option.said
          againstSize.set(lead, e)
        }
      }
    }
    for (const lead of moved) {
      lead.p = sigmoid(lead.score)
      // "Partly" asks one more question about it; this was it.
      if (lead.state === 'checking') lead.state = lead.p >= 0.5 ? 'partly' : 'out'
      // Two questions before the answers alone rule it out: one stray tap shouldn't.
      else if (lead.state === 'live' && lead.p < RULED_OUT_BELOW && lead.tested >= 2) lead.state = 'out'
    }
  }

  // A "Partly" with nothing left to ask about it settles as partly.
  const asked = new Set(probeSteps(a.pinpoint).map((s) => s.probe))
  const open = askableProbes(a, patterns).filter((p) => !asked.has(p.id))
  for (const lead of out) {
    if (lead.state === 'checking' && !open.some((p) => touches(p, lead.pattern.id))) lead.state = 'partly'
  }
  return out
}

/** What a probe answer said, in the member's words: the first option with a line of its own. */
export function stepSaid(step: Extract<PinpointStep, { kind: 'probe' }>): string | null {
  const probe = PROBE_BY_ID[step.probe]
  if (!probe || step.unsure) return null
  for (const item of probe.items) {
    const option = item.options.find((o) => o.key === step.answer[item.key])
    if (!option) continue
    if (probe.dayLine && step.minutes !== undefined && probe.dayLine.buckets.some((b) => b.key === option.key)) return probe.dayLine.said(step.minutes)
    if (option.said) return option.said
  }
  const first = probe.items[0]?.options.find((o) => o.key === step.answer[probe.items[0].key])
  return first ? first.label : null
}

/** Answers that support it, not counting the core screens. */
export function answerSupport(lead: Lead): number {
  return lead.support.filter((e) => e.from === 'answer').length
}

/** Answers to questions mainly about it. */
export function directSupport(lead: Lead): number {
  return lead.support.filter((e) => e.from === 'answer' && e.direct).length
}

export const isIn = (l: Lead) => l.state === 'live' || l.state === 'checking'
export const isPinned = (l: Lead) => l.state === 'yes' || l.state === 'partly'
export const isOut = (l: Lead) => l.state === 'no' || l.state === 'out'
