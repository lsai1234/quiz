/**
 * What Pinpoint changes in the stack (plan v5 §4.3).
 *
 * Only on the Pinpoint route, and only for patterns the person confirmed, or
 * that were strong when they stopped early. The weights go into the same need
 * scoring as everything else, with the pattern's "For your…" line as the
 * reason; keep-outs only follow a pattern the person said was them.
 */

import { isPinned, leads, type Lead } from './leads'
import { LIMITS } from './choose'
import type { Answers } from './types'

/** How much a pattern counts, by what the person said. */
export const WEIGHT = { yes: 1, partly: 0.6, unchecked: 0.5 } as const

export interface Effect {
  lead: Lead
  factor: number
}

export function pinpointEffects(a: Answers): Effect[] {
  if (a.route !== 'pinpoint' || !a.pinpoint) return []
  const out: Effect[] = []
  for (const lead of leads(a)) {
    if (lead.state === 'yes') out.push({ lead, factor: WEIGHT.yes })
    else if (lead.state === 'partly') out.push({ lead, factor: WEIGHT.partly })
    else if (lead.state === 'live' && lead.p >= LIMITS.hunchAt) out.push({ lead, factor: WEIGHT.unchecked })
  }
  return out
}

/** The patterns to show as pinpointed, strongest first: confirmed, then partly. */
export function pinpointed(a: Answers): Lead[] {
  if (a.route !== 'pinpoint' || !a.pinpoint) return []
  return leads(a)
    .filter(isPinned)
    .sort((x, y) => Number(y.state === 'yes') - Number(x.state === 'yes') || y.p - x.p)
}
