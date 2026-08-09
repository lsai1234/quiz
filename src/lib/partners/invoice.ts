/**
 * The self-billed invoice behind a payout.
 *
 * "Self-billed" means WE raise the invoice on the partner's behalf rather than
 * chasing one from them — which is what `payout.selfBilled` promises on their
 * terms screen, and what makes a monthly run possible at all. HMRC requires a
 * self-billed invoice to say so on its face and to carry the supplier's details,
 * so both are stated rather than implied.
 *
 * Derived from the ledger rows every time rather than stored: an invoice that
 * disagreed with its own lines would be the worst possible artefact to find
 * eighteen months later, and the rows are the record.
 *
 * Pure — the caller fetches, this arranges.
 */
import type { PartnerCommission, PartnerPayout, PartnerTerms, Partner } from './types'
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'

export interface InvoiceLine {
  /** `first` or `renewal`, in words. */
  description: string
  /** How many commissions of this kind. */
  count: number
  /** Net revenue they were earned on (£). */
  basis: number
  /** The rate — null when the lines behind it were earned at different rates. */
  rate: number | null
  amount: number
}

export interface SelfBilledInvoice {
  /** Human reference, stable for a given payout. */
  number: string
  /** `YYYY-MM` the commission was settled for. */
  period: string
  issuedAt: string
  selfBilled: boolean
  supplier: { name: string; email: string }
  lines: InvoiceLine[]
  /** Commission earned, ex VAT (£). */
  net: number
  /** VAT the partner charges us, when they are registered (£). */
  vat: number
  vatRate: number
  /** What actually gets sent (£). */
  gross: number
  state: 'due' | 'paid'
  reference: string | null
  /** The sentence that has to appear on a self-billed document. */
  notice: string
}

/**
 * Group the rows by what they were: a first order or a renewal, at a rate.
 *
 * Grouped rather than one line per order because a partner reading their own
 * invoice wants "34 first orders at 15%", not thirty-four lines — and the
 * per-order detail is on their dashboard anyway. Rows earned at different rates
 * within a kind stay separate, because a rate change mid-period is exactly the
 * thing an invoice must not average away.
 */
export function invoiceLines(rows: PartnerCommission[]): InvoiceLine[] {
  const groups = new Map<string, InvoiceLine>()

  for (const row of rows) {
    const key = `${row.kind}:${row.rate}`
    const existing = groups.get(key)
    if (existing) {
      existing.count += 1
      existing.basis = round(existing.basis + row.netBasis)
      existing.amount = round(existing.amount + row.amount)
    } else {
      groups.set(key, {
        description: row.kind === 'first' ? 'Commission on first orders' : 'Commission on renewals',
        count: 1,
        basis: round(row.netBasis),
        rate: row.rate,
        amount: round(row.amount),
      })
    }
  }

  // Firsts before renewals, deepest rate first inside each — the order somebody
  // reading it would expect.
  return [...groups.values()].sort((a, b) => {
    if (a.description !== b.description) return a.description < b.description ? -1 : 1
    return (b.rate ?? 0) - (a.rate ?? 0)
  })
}

export function buildInvoice(input: {
  payout: PartnerPayout
  partner: Partner
  terms: PartnerTerms
  rows: PartnerCommission[]
  config?: PricingConfig
}): SelfBilledInvoice {
  const config = input.config ?? getPricingConfig()
  const lines = invoiceLines(input.rows)
  const net = round(lines.reduce((s, l) => s + l.amount, 0))

  /**
   * VAT is the PARTNER'S, not ours.
   *
   * A VAT-registered partner invoices commission plus VAT, so their commission
   * costs us 20% more than the rate suggests — and we cannot reclaim it unless
   * we are registered ourselves. Read from THEIR terms rather than the
   * programme default, because it is a fact about them.
   */
  const vatRate = input.terms.payout.chargesVat ? config.vat.standardRate : 0
  const vat = round(net * vatRate)

  return {
    number: invoiceNumber(input.payout),
    period: input.payout.period,
    issuedAt: input.payout.createdAt,
    selfBilled: input.terms.payout.selfBilled,
    supplier: { name: input.partner.name, email: input.partner.email },
    lines,
    net,
    vat,
    vatRate,
    gross: round(net + vat),
    state: input.payout.state,
    reference: input.payout.reference,
    notice: input.terms.payout.selfBilled
      ? 'The buyer (CHRGD) has raised this invoice on behalf of the supplier — self-billed. No invoice is required from you.'
      : 'Raised by CHRGD as a statement of commission due.',
  }
}

/**
 * A readable, stable reference: `CHRGD-SB-2026-08-msk64t`.
 *
 * Derived from the payout rather than a counter, so it cannot drift from the
 * thing it names and two processes cannot mint the same one. `SB` marks it as
 * self-billed at a glance in a bank statement or an accountant's inbox.
 */
export function invoiceNumber(payout: PartnerPayout): string {
  const suffix = payout.id.replace(/^ppay_/, '').slice(0, 8).toUpperCase()
  return `CHRGD-SB-${payout.period}-${suffix}`
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
