/**
 * Partner terms — the deal, effective-dated.
 *
 * Pure helpers over `PartnerTerms` rows. The rows themselves are append-only:
 * a change inserts, it never updates. See `types.ts` for why.
 */
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'
import type { PartnerTerms, PayoutTerms } from './types'

/** The terms a new partner starts on, from the programme-wide defaults. */
export function defaultTerms(config = getPricingConfig()): Omit<PartnerTerms, 'id' | 'partnerId' | 'createdAt'> {
  const p = config.partners
  return {
    firstOrderPct: p.firstOrderPct,
    renewalPct: p.renewalPct,
    renewalMonths: p.renewalMonths,
    payout: {
      cadence: p.payout.cadence,
      minimum: p.payout.minimum,
      selfBilled: p.payout.selfBilled,
      chargesVat: p.partnersChargeVat,
    },
    effectiveFrom: new Date().toISOString(),
    note: 'Standard programme terms.',
    createdBy: null,
  }
}

/**
 * The row in force at `at` — the latest one that has actually taken effect.
 *
 * Future-dated rows are deliberately not returned: a rate agreed to start next
 * month must not be what this month's commission is calculated at.
 */
export function termsInForce(history: PartnerTerms[], at: Date = new Date()): PartnerTerms | null {
  const applicable = history
    .filter((t) => new Date(t.effectiveFrom) <= at)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
  return applicable[0] ?? null
}

/** Newest first, for the history a partner reads. */
export function sortedHistory(history: PartnerTerms[]): PartnerTerms[] {
  return [...history].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
}

export type TermsChangeCheck = { ok: true } | { ok: false; reason: string }

/**
 * Whether a proposed change may take effect from `effectiveFrom`.
 *
 * The constraint that matters: a change **cannot be backdated over commission
 * already earned**. The ledger stores the rate that applied on the day, so
 * backdating past it would leave the stored rate and the stated terms
 * disagreeing — and the partner reading their history would be told they were on
 * a rate they were never actually paid.
 */
export function canTakeEffect(
  effectiveFrom: string,
  oldestUnsettled: string | null,
  now: Date = new Date(),
): TermsChangeCheck {
  const from = new Date(effectiveFrom)
  if (Number.isNaN(from.getTime())) return { ok: false, reason: 'That is not a valid date.' }

  if (oldestUnsettled === null) {
    // Nothing earned yet: any date is fair, including a backdated one.
    return { ok: true }
  }
  if (from < new Date(oldestUnsettled)) {
    return {
      ok: false,
      reason:
        `Commission has already been earned from ${oldestUnsettled.slice(0, 10)} at the current rate. ` +
        'New terms can start from that date at the earliest — earlier would restate what has already been paid.',
    }
  }
  void now
  return { ok: true }
}

/**
 * Human-readable summary of what a partner earns, for the dashboard.
 *
 * Takes the rates rather than a whole row so the hub can describe the standard
 * deal — which has no row yet — in exactly the words a partner will later read.
 */
export function describeTerms(terms: Pick<PartnerTerms, 'firstOrderPct' | 'renewalPct' | 'renewalMonths'>): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`
  return (
    `${pct(terms.firstOrderPct)} of the net on a first order, then ${pct(terms.renewalPct)} of every renewal ` +
    `for ${terms.renewalMonths} months from signup.`
  )
}

/** Human-readable summary of how they get paid. */
export function describePayout(payout: PayoutTerms): string {
  const cadence = payout.cadence === 'monthly' ? 'Monthly' : 'Quarterly'
  const billing = payout.selfBilled ? 'We raise the invoice for you' : 'You invoice us'
  const vat = payout.chargesVat ? ', plus VAT' : ''
  return `${cadence} in arrears, once you are owed at least £${payout.minimum}. ${billing}${vat}.`
}
