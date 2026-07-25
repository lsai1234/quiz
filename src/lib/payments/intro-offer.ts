/**
 * The GLOBAL intro-offer state (server-only).
 *
 * The intro ladder (intro-ladder.ts) is a single discount shown to everyone that
 * steps down as orders arrive. The position is stored in the KV table so it's
 * shared across all visitors and survives restarts. The reveal reads the current
 * offer (GET /api/intro-offer); a completed subscription checkout advances it
 * (finalizeCheckout → recordIntroCheckout).
 *
 * Note: read-modify-write on KV isn't atomic — fine at this volume; the quota is
 * a soft target (a few extra 50%s if two orders land at once is acceptable).
 */
import { kvGet, kvSet } from '@/lib/db/kv'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'
import {
  INITIAL_LADDER_STATE, currentLadderDiscount, headlineLadderDiscount, advanceLadder,
  type LadderState,
} from './intro-ladder'

const KEY = 'intro:ladder-state'

function stages(config = getPricingConfig()) {
  const l = config.introOffer.ladder
  return l?.enabled ? l.stages : []
}

export async function readLadderState(): Promise<LadderState> {
  return (await kvGet<LadderState>(KEY)) ?? INITIAL_LADDER_STATE
}

export interface IntroOffer {
  /** The first-month discount everyone currently gets, 0–1. */
  discount: number
  /** Same as a percentage, for copy. */
  pct: number
  /** The biggest discount on the ladder — the "up to X% off" headline. */
  headlinePct: number
}

/** The offer to show right now. Returns a zero offer when the ladder is off. */
export async function getIntroOffer(config = getPricingConfig()): Promise<IntroOffer> {
  const s = stages(config)
  if (s.length === 0) return { discount: 0, pct: 0, headlinePct: 0 }
  const state = await readLadderState()
  const discount = currentLadderDiscount(s, state)
  return {
    discount,
    pct: Math.round(discount * 100),
    headlinePct: Math.round(headlineLadderDiscount(s) * 100),
  }
}

/** Advance the ladder by one checkout. No-op when the ladder is off. */
export async function recordIntroCheckout(config = getPricingConfig()): Promise<void> {
  const s = stages(config)
  if (s.length === 0) return
  const state = await readLadderState()
  await kvSet(KEY, advanceLadder(s, state))
}
