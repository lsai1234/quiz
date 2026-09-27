/**
 * The maths under Pinpoint, in one place.
 *
 * Each pattern holds a score in log-odds. An answer adds the log of how much
 * likelier it is from someone the pattern fits than from someone it doesn't.
 * Those two likelihoods come from the option's *pull* on the pattern:
 *
 *   P(option | fits)      ∝ base × e^(+pull)
 *   P(option | doesn't)   ∝ base × e^(−pull)
 *
 * so a strongly-pulling option is much likelier from people it fits, and an
 * option pulling away is likelier from people it doesn't. `base` is how often
 * anyone picks that option. The library is written in words ("strongly
 * towards"); `define.ts` turns the words into pulls.
 *
 * The next question is the one with the highest expected information gain:
 * how much, on average over its likely answers, it would settle the patterns
 * still in play.
 */

import type { PatternId, ProbeItem } from './types'

/** Pull sizes behind the strength words. */
export const PULL = { 'a little': 0.45, clearly: 0.8, strongly: 1.1 } as const

/** Nudges from the core answers, in log-odds. */
export const NUDGE = { 'a little': 0.4, clearly: 0.8, strongly: 1.2 } as const

export const sigmoid = (l: number) => 1 / (1 + Math.exp(-l))

/** Uncertainty of a yes/no, in bits. */
export function entropy(p: number): number {
  if (p <= 0 || p >= 1) return 0
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p))
}

export interface Likelihoods {
  fits: number[]
  doesnt: number[]
}

/** How likely each option of an item is, from someone the pattern fits and from someone it doesn't. Null if the item doesn't touch it. */
export function likelihoods(item: ProbeItem, pattern: PatternId): Likelihoods | null {
  const pulls = item.options.map((o) => o.pulls[pattern] ?? 0)
  if (pulls.every((p) => p === 0)) return null
  const fits = item.base.map((b, i) => b * Math.exp(pulls[i]))
  const doesnt = item.base.map((b, i) => b * Math.exp(-pulls[i]))
  const zf = fits.reduce((s, x) => s + x, 0)
  const zd = doesnt.reduce((s, x) => s + x, 0)
  return { fits: fits.map((x) => x / zf), doesnt: doesnt.map((x) => x / zd) }
}

/** What answering `option` adds to the pattern's score. */
export function evidence(item: ProbeItem, option: number, pattern: PatternId): number {
  const l = likelihoods(item, pattern)
  return l ? Math.log(l.fits[option] / l.doesnt[option]) : 0
}

/** Expected bits an item would settle about one pattern at strength `p`. */
export function itemGain(item: ProbeItem, pattern: PatternId, p: number): number {
  const l = likelihoods(item, pattern)
  if (!l) return 0
  let expected = 0
  for (let i = 0; i < item.base.length; i++) {
    const po = p * l.fits[i] + (1 - p) * l.doesnt[i]
    if (po > 0) expected += po * entropy((p * l.fits[i]) / po)
  }
  return entropy(p) - expected
}
