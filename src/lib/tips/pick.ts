/**
 * The tips a member sees this week: the ones that fit their box, their day
 * and whether they train, product tips first; three a week, the same all week,
 * and never one they've already had until every fitting tip has been shown.
 * Pure.
 */
import type { PourAnchor, SwapGroup } from '@/lib/catalogue/types'
import { FAQS, TIPS, type Faq, type Tip } from './library'

export interface TipContext {
  kinds: readonly SwapGroup[]
  moments: readonly PourAnchor[]
  trains: boolean
}

export const TIPS_PER_WEEK = 3

export function fits(tip: Tip, ctx: TipContext): boolean {
  if (tip.trains && !ctx.trains) return false
  if (tip.kinds && !tip.kinds.some((k) => ctx.kinds.includes(k))) return false
  if (tip.moments && !tip.moments.some((m) => ctx.moments.includes(m))) return false
  return true
}

/** How specific a tip is to them: product tips first, then their moments, then the rest. */
function score(tip: Tip): number {
  return (tip.kinds ? 2 : 0) + (tip.moments ? 1 : 0)
}

/** A small stable hash, so a week's order is the same each time it's asked for. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * This week's tips, and the record of what they've seen. `seen` comes back
 * with this week's added; when every fitting tip has been seen it starts over.
 */
export function pickTips(ctx: TipContext, week: string, seen: readonly string[], salt = ''): { tips: Tip[]; seen: string[] } {
  const fitting = TIPS.filter((t) => fits(t, ctx))
  let fresh = fitting.filter((t) => !seen.includes(t.id))
  let history = [...seen]
  if (fresh.length < TIPS_PER_WEEK) {
    history = []
    fresh = fitting
  }
  const ordered = [...fresh].sort((a, b) => score(b) - score(a) || hash(week + salt + a.id) - hash(week + salt + b.id))
  const tips = ordered.slice(0, TIPS_PER_WEEK)
  return { tips, seen: [...history, ...tips.map((t) => t.id)] }
}

/** The common questions for a product kind: its own first, then the general ones. */
export function faqsFor(kind: SwapGroup | null | undefined): Faq[] {
  const own = FAQS.filter((f) => f.kinds && kind && f.kinds.includes(kind))
  const general = FAQS.filter((f) => !f.kinds)
  return [...own, ...general].slice(0, 6)
}

/** The storing and mixing tips for one product kind. */
export function careTipsFor(kind: SwapGroup | null | undefined): Tip[] {
  if (!kind) return []
  return TIPS.filter((t) => t.kinds?.includes(kind) && (t.topic === 'mixing' || t.topic === 'storage' || t.topic === 'taste')).slice(0, 4)
}
