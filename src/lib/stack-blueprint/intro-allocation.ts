/**
 * First-month discount allocation.
 *
 * The scratch card looks like luck. It is random — but it's rationed luck: the
 * odds are set so the average discount across members who actually check out
 * lands on the `effectiveFirstMonthDiscount` configured in the portal. That's
 * the number the business controls. The individual 50% / 25% / 10% cards are
 * just how that budget gets spent, and their proportions fall out of it: raise
 * the effective discount and 50% cards get common, lower it and they get rare.
 *
 * The ledger counts CLAIMS, not reveals. A card only lands in it when a checkout
 * is finalized (see `claimIntroDiscount` in `lib/checkout/finalize.ts`), so
 * someone who scratches a 50% and never buys costs nothing and doesn't push the
 * average up. This matters because conversion isn't flat across the outcomes —
 * a 50% card converts better than a 10% one — so budgeting against offers would
 * consistently overspend. Budgeting against claims can't.
 *
 * Two pieces do the work:
 *
 *   1. `tiltedOdds` bends the configured outcome weights until their expected
 *      value equals a given rate. Every outcome keeps some probability, so the
 *      card never degenerates into a fixed prize, and the weights in
 *      PRICING_CONFIG still describe the *shape* of the mix (which outcome feels
 *      common) while the effective discount sets its *level*.
 *   2. Each allocation aims at whatever rate would put the running realized mean
 *      back on target, not at the target itself. That's the feedback loop: if
 *      claims have run rich the next cards skew cheap, and vice versa, so the
 *      realized average converges no matter how conversion varies by outcome.
 */
import { kvGet, kvSet } from '@/lib/db/kv'
import { getPricingConfig, scratchOutcomes, type PricingConfig } from './pricing'

const LEDGER_KEY = 'intro-allocation'

/** Claims to date, keyed by the granted rate as a string ("0.5" → 12 claims). */
export interface IntroLedger {
  claims: Record<string, number>
}

export const EMPTY_LEDGER: IntroLedger = { claims: {} }

export interface LedgerTotals {
  /** Number of checkouts that claimed a discount. */
  count: number
  /** Sum of the granted rates — `count` × `mean`. */
  sum: number
  /** The realized blended discount to date (0 when nothing has been claimed). */
  mean: number
}

export function ledgerTotals(ledger: IntroLedger): LedgerTotals {
  let count = 0
  let sum = 0
  for (const [rate, n] of Object.entries(ledger.claims)) {
    const r = Number(rate)
    if (!Number.isFinite(r) || !Number.isFinite(n) || n <= 0) continue
    count += n
    sum += r * n
  }
  return { count, sum, mean: count > 0 ? sum / count : 0 }
}

// ─── The odds ────────────────────────────────────────────────────────────────

/** One outcome and the probability it's currently being granted at. */
export interface IntroOdds {
  rate: number
  probability: number
}

/** Bisection bounds for the tilt. ±400 saturates long before it overflows. */
const TILT_LIMIT = 400
const TILT_STEPS = 60

/**
 * The configured outcome weights, bent so their expected value equals `aim`.
 *
 * Each weight is scaled by e^(θ · rate) with θ solved by bisection — the
 * standard exponential tilt. θ = 0 leaves the configured weights untouched
 * (their natural average), θ > 0 pushes probability toward the generous
 * outcomes, θ < 0 toward the cheap ones. The mean is monotonic in θ, so
 * bisection always converges.
 *
 * `aim` outside the range of configured rates is unreachable — the tilt
 * saturates on the nearest outcome, which is the right answer anyway.
 */
export function tiltedOdds(
  aim: number,
  config: PricingConfig = getPricingConfig(),
): IntroOdds[] {
  const outcomes = scratchOutcomes(config).filter((o) => o.weight > 0)
  if (outcomes.length === 0) return []
  if (outcomes.length === 1) return [{ rate: outcomes[0].discount, probability: 1 }]

  const oddsAt = (theta: number): IntroOdds[] => {
    // Shift by the max exponent before exponentiating so a steep tilt can't
    // overflow to Infinity and produce NaN probabilities.
    const exponents = outcomes.map((o) => theta * o.discount)
    const peak = Math.max(...exponents)
    const scaled = outcomes.map((o, i) => o.weight * Math.exp(exponents[i] - peak))
    const total = scaled.reduce((s, w) => s + w, 0)
    return outcomes.map((o, i) => ({ rate: o.discount, probability: scaled[i] / total }))
  }
  const meanAt = (theta: number) => oddsAt(theta).reduce((s, o) => s + o.rate * o.probability, 0)

  let lo = -TILT_LIMIT
  let hi = TILT_LIMIT
  if (aim <= meanAt(lo)) return oddsAt(lo)
  if (aim >= meanAt(hi)) return oddsAt(hi)
  for (let i = 0; i < TILT_STEPS; i++) {
    const mid = (lo + hi) / 2
    if (meanAt(mid) < aim) lo = mid
    else hi = mid
  }
  return oddsAt((lo + hi) / 2)
}

/**
 * The rate the NEXT card should aim at so the running realized mean lands on
 * `target` — the target itself, plus however far the ledger has drifted off it.
 *
 * Clamped to the configured outcomes: one card can only correct so much, and a
 * big historic overspend shouldn't demand a negative discount.
 */
export function correctedAim(
  ledger: IntroLedger,
  target: number,
  config: PricingConfig = getPricingConfig(),
): number {
  const rates = scratchOutcomes(config).map((o) => o.discount)
  if (rates.length === 0) return target
  const { count, sum } = ledgerTotals(ledger)
  const needed = target * (count + 1) - sum
  return Math.min(Math.max(needed, Math.min(...rates)), Math.max(...rates))
}

/** The odds this visitor's card is being drawn against, given the ledger. */
export function introOdds(
  ledger: IntroLedger,
  target: number,
  config: PricingConfig = getPricingConfig(),
): IntroOdds[] {
  return tiltedOdds(correctedAim(ledger, target, config), config)
}

/**
 * Draw the rate to put under the next scratch card. `rng` is injectable so the
 * draw is deterministic in tests. Returns 0 when there's nothing to grant.
 */
export function chooseIntroRate(
  ledger: IntroLedger,
  target: number,
  config: PricingConfig = getPricingConfig(),
  rng: () => number = Math.random,
): number {
  const odds = introOdds(ledger, target, config)
  if (odds.length === 0) return 0
  let roll = rng()
  for (const o of odds) {
    roll -= o.probability
    if (roll < 0) return o.rate
  }
  return odds[odds.length - 1].rate
}

// ─── Persistence ─────────────────────────────────────────────────────────────
// Server-only. Backed by the same kv table as the portal's settings.

export async function readIntroLedger(): Promise<IntroLedger> {
  const stored = await kvGet<IntroLedger>(LEDGER_KEY)
  if (!stored || typeof stored.claims !== 'object' || stored.claims === null) return EMPTY_LEDGER
  return stored
}

/**
 * Bank a granted rate against the ledger. Called once per finalized checkout.
 *
 * Read-modify-write on a JSON blob, so two checkouts landing in the same instant
 * can lose one increment. That costs a rounding error on the blended average and
 * the feedback loop absorbs it on the next allocation, which is a fair trade for
 * not putting a lock in the checkout path.
 */
export async function recordIntroClaim(rate: number): Promise<void> {
  if (!Number.isFinite(rate) || rate <= 0) return
  const ledger = await readIntroLedger()
  const key = String(rate)
  await kvSet<IntroLedger>(LEDGER_KEY, {
    claims: { ...ledger.claims, [key]: (ledger.claims[key] ?? 0) + 1 },
  })
}

/** The rate this visitor's card should reveal, against the live ledger + config. */
export async function allocateIntroRate(config: PricingConfig = getPricingConfig()): Promise<number> {
  const ledger = await readIntroLedger()
  return chooseIntroRate(ledger, config.introOffer.effectiveFirstMonthDiscount, config)
}
