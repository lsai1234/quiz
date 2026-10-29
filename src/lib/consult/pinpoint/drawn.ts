/**
 * Shape your day as Pinpoint evidence (plan Phase 7.4). Signed off 2026-10-29
 * as "add", with the cap on pointing away (docs/shape-your-day-proposal.md).
 *
 * What the drawn curve shows (`readCurve`) is read like an answer to a probe
 * nobody had to ask, marked `drawn`: three items, each through the same
 * `evidence()` as every probe, so the maths is the maths Pinpoint already
 * uses. `previewDrawn` lets the report in the proposal measure each way
 * against the 20 Questions people.
 *
 *   dip      deep (3+ levels) · some (2) · none
 *   morning  slow · fine
 *   evening  a second wind · flat
 *
 * Drawn evidence counts as an answer but never as one "mainly about" a
 * pattern: a hunch still needs a probe answer behind it.
 */

import { readCurve } from '../day-curve'
import { pull } from './define'
import type { Answers, PatternId, ProbeItem } from './types'

export const DRAWN_EVIDENCE_LIVE = true

/**
 *   off      the curve feeds Pinpoint only through the afternoon level, as the battery did
 *   add      drawn evidence on top of everything else
 *   replace  drawn evidence instead of the afternoon level's nudges to the 3pm crash
 *            (the same afternoon, counted once)
 */
export type DrawnMode = 'off' | 'add' | 'replace'

let preview: DrawnMode | null = null

/** For the proposal's report and tests only. */
export function previewDrawn(mode: DrawnMode | null) {
  preview = mode
}

export function drawnMode(): DrawnMode {
  return preview ?? (DRAWN_EVIDENCE_LIVE ? 'add' : 'off')
}

const p = pull

export const DRAWN_ITEMS: (ProbeItem & { said: Record<string, string | undefined> })[] = [
  {
    key: 'dip',
    base: [0.25, 0.2, 0.55],
    options: [
      { key: 'deep', label: 'A deep dip', pulls: { crash: p('strongly'), empty: p('a little'), 'eating-less': p('a little'), wired: p('a little') } },
      { key: 'some', label: 'A dip', pulls: { crash: p('a little') } },
      { key: 'none', label: 'No dip', pulls: { crash: p('away clearly'), empty: p('away a little'), 'eating-less': p('away a little') } },
    ],
    said: { deep: 'Your day drops sharply around {dip}', some: 'Your day dips around {dip}', none: 'No afternoon dip in the day you drew' },
  },
  {
    key: 'morning',
    base: [0.3, 0.7],
    options: [
      { key: 'slow', label: 'Slow mornings', pulls: { 'short-sleep': p('clearly'), 'broken-nights': p('a little'), 'stiff-starter': p('a little') } },
      { key: 'fine', label: 'Fine mornings', pulls: { 'short-sleep': p('away a little') } },
    ],
    said: { slow: 'Slow to get going in the morning', fine: 'Mornings are fine in the day you drew' },
  },
  {
    key: 'evening',
    base: [0.25, 0.75],
    options: [
      { key: 'rise', label: 'A second wind', pulls: { wired: p('clearly') } },
      { key: 'flat', label: 'No second wind', pulls: { wired: p('away a little') } },
    ],
    said: { rise: 'A second wind in the evening', flat: 'No second wind in the day you drew' },
  },
]

/** The curve as answers to the three items; null without a curve. */
export function drawnAnswers(a: Answers): { answer: Record<string, string>; dip: number | null } | null {
  const points = a.energyCurve?.points
  if (!points) return null
  const s = readCurve(points)
  return {
    answer: { dip: !s.dip ? 'none' : s.dip.depth >= 3 ? 'deep' : 'some', morning: s.slowMorning ? 'slow' : 'fine', evening: s.eveningRise ? 'rise' : 'flat' },
    dip: s.dip?.at ?? null,
  }
}

/**
 * A drawn day points away from a pattern only this much (log-odds, the size
 * of a small nudge). A quick drawing can miss a dip that's there; one that
 * shows it is hard to draw by accident. Without the cap, the quarter of 3pm
 * crashers whose drawing misses the dip drop out before Amp asks a thing.
 */
export const DRAWN_AWAY_CAP = 0.4

/** Patterns whose afternoon-level nudges the curve stands in for, in "replace". */
export const REPLACED_NUDGES: PatternId[] = ['crash']
