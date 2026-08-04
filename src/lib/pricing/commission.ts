/**
 * Partner commission.
 *
 * Always a percentage of NET revenue — ex VAT, ex delivery. Never of the gross:
 * up to a fifth of a gross price is HMRC's money, and delivery is a pass-through
 * we usually lose money on. Paying commission on either means paying partners
 * out of money that was never margin.
 *
 * See docs/INFLUENCER_PROGRAMME.md for the rates and why they are what they are.
 */
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'

const round = (n: number) => Math.round(n * 100) / 100

/** Which side of a partner's earnings an order falls on. */
export type CommissionKind = 'first' | 'renewal'

export interface Commission {
  kind: CommissionKind
  /** The headline rate for this kind of order (0–1). */
  rate: number
  /** What the partner earns (£). */
  amount: number
  /**
   * What it actually costs us (£). Higher than `amount` when the partner is
   * VAT-registered and we cannot reclaim — their invoice carries VAT on top,
   * so a £20 commission is a £24 cost. That is most of the partners worth
   * having, so it is modelled rather than discovered.
   */
  cost: number
}

/** The commission on one order's net revenue. */
export function commissionOn(
  netRevenue: number,
  kind: CommissionKind,
  config: PricingConfig = getPricingConfig(),
): Commission {
  const rate = kind === 'first' ? config.partners.firstOrderPct : config.partners.renewalPct
  const amount = round(Math.max(0, netRevenue) * rate)
  const irrecoverableVat = config.partners.partnersChargeVat && !config.vat.registered
  return {
    kind,
    rate,
    amount,
    cost: irrecoverableVat ? round(amount * (1 + config.vat.standardRate)) : amount,
  }
}

/**
 * What a partner earns from one customer over their whole life with us.
 *
 * The renewal rate is paid for `renewalMonths` and then stops — the partner's
 * post plausibly drove the first few months and has nothing to do with whether
 * someone is still subscribed two years later. Anything after the window is
 * ours.
 */
export function lifetimeCommission(
  firstOrderNet: number,
  renewalNet: number,
  monthsRetained: number,
  config: PricingConfig = getPricingConfig(),
): { total: number; cost: number; monthsPaid: number } {
  const first = commissionOn(firstOrderNet, 'first', config)
  const renewalsRetained = Math.max(0, monthsRetained - 1)
  const monthsPaid = Math.min(renewalsRetained, config.partners.renewalMonths)
  const renewal = commissionOn(renewalNet, 'renewal', config)
  return {
    total: round(first.amount + renewal.amount * monthsPaid),
    cost: round(first.cost + renewal.cost * monthsPaid),
    monthsPaid,
  }
}
