/**
 * The self-billed invoice — the document a partner is paid against.
 */
import { buildInvoice, invoiceLines, invoiceNumber } from '@/lib/partners/invoice'
import { PRICING_CONFIG, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import type { Partner, PartnerCommission, PartnerPayout, PartnerTerms } from '@/lib/partners/types'

const cfg = (over: Partial<PricingConfig> = {}): PricingConfig => ({ ...PRICING_CONFIG, ...over })

function row(over: Partial<PartnerCommission> = {}): PartnerCommission {
  return {
    id: `pcom_${Math.random()}`,
    partnerId: 'ptnr_1',
    orderId: `ord_${Math.random()}`,
    kind: 'first',
    netBasis: 100,
    rate: 0.15,
    amount: 15,
    state: 'invoiced',
    confirmAfter: '2026-08-15T00:00:00.000Z',
    payoutId: 'ppay_1',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...over,
  }
}

const partner: Partner = {
  id: 'ptnr_1',
  email: 'sarah@example.com',
  name: 'Sarah Jones',
  status: 'active',
  data: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function terms(over: Partial<PartnerTerms['payout']> = {}): PartnerTerms {
  return {
    id: 'ptrm_1',
    partnerId: 'ptnr_1',
    firstOrderPct: 0.15,
    renewalPct: 0.05,
    renewalMonths: 6,
    payout: { cadence: 'monthly', minimum: 25, selfBilled: true, chargesVat: false, ...over },
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    note: null,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

const payout: PartnerPayout = {
  id: 'ppay_msk64tyy0',
  partnerId: 'ptnr_1',
  period: '2026-08',
  amount: 45,
  state: 'due',
  reference: null,
  createdAt: '2026-09-01T00:00:00.000Z',
}

describe('grouping the lines', () => {
  it('collapses same-kind, same-rate rows into one line', () => {
    // A partner reading their own invoice wants "3 first orders at 15%", not
    // three lines — the per-order detail is on their dashboard anyway.
    const lines = invoiceLines([row(), row(), row()])
    expect(lines).toHaveLength(1)
    expect(lines[0].count).toBe(3)
    expect(lines[0].basis).toBe(300)
    expect(lines[0].amount).toBe(45)
  })

  it('keeps different rates apart', () => {
    // A rate change mid-period is exactly the thing an invoice must not average
    // away — the partner would have no way to check it.
    const lines = invoiceLines([row({ rate: 0.15, amount: 15 }), row({ rate: 0.25, amount: 25 })])
    expect(lines).toHaveLength(2)
    expect(lines.map((l) => l.rate)).toEqual([0.25, 0.15])
  })

  it('keeps first orders and renewals apart', () => {
    const lines = invoiceLines([row(), row({ kind: 'renewal', rate: 0.05, amount: 5 })])
    expect(lines).toHaveLength(2)
    expect(lines[0].description).toMatch(/first orders/)
    expect(lines[1].description).toMatch(/renewals/)
  })

  it('is empty for a payout with no rows behind it', () => {
    expect(invoiceLines([])).toEqual([])
  })
})

describe('the invoice', () => {
  it('adds up to its own lines', () => {
    // An invoice that does not equal its own lines is the worst possible thing
    // to find eighteen months later.
    const invoice = buildInvoice({ payout, partner, terms: terms(), rows: [row(), row(), row()], config: cfg() })
    expect(invoice.net).toBe(45)
    expect(invoice.net).toBe(invoice.lines.reduce((s, l) => s + l.amount, 0))
    expect(invoice.gross).toBe(invoice.net + invoice.vat)
  })

  it('says on its face that it is self-billed', () => {
    // HMRC requires it, and a partner receiving a document they did not raise
    // deserves to be told why.
    const invoice = buildInvoice({ payout, partner, terms: terms(), rows: [row()], config: cfg() })
    expect(invoice.selfBilled).toBe(true)
    expect(invoice.notice).toMatch(/self-billed/i)
    expect(invoice.notice).toMatch(/No invoice is required from you/i)
    expect(invoice.supplier).toEqual({ name: 'Sarah Jones', email: 'sarah@example.com' })
  })

  it('says something different when we are not self-billing', () => {
    const invoice = buildInvoice({ payout, partner, terms: terms({ selfBilled: false }), rows: [row()], config: cfg() })
    expect(invoice.selfBilled).toBe(false)
    expect(invoice.notice).not.toMatch(/self-billed/i)
  })

  it('charges no VAT for a partner who is not registered', () => {
    const invoice = buildInvoice({ payout, partner, terms: terms({ chargesVat: false }), rows: [row()], config: cfg() })
    expect(invoice.vatRate).toBe(0)
    expect(invoice.vat).toBe(0)
    expect(invoice.gross).toBe(invoice.net)
  })

  it('adds VAT for one who is, which costs us 20% more than the rate says', () => {
    const invoice = buildInvoice({ payout, partner, terms: terms({ chargesVat: true }), rows: [row()], config: cfg() })
    expect(invoice.vatRate).toBe(PRICING_CONFIG.vat.standardRate)
    expect(invoice.vat).toBe(3)
    expect(invoice.gross).toBe(18)
  })

  it('reads VAT from THEIR terms, not the programme default', () => {
    // It is a fact about them. The config figure is only what a new partner
    // starts on.
    expect(PRICING_CONFIG.partners.partnersChargeVat).toBe(false)
    const registered = buildInvoice({ payout, partner, terms: terms({ chargesVat: true }), rows: [row()], config: cfg() })
    expect(registered.vat).toBeGreaterThan(0)
  })
})

describe('the invoice number', () => {
  it('is readable, and marks a self-billed document at a glance', () => {
    expect(invoiceNumber(payout)).toBe('CHRGD-SB-2026-08-MSK64TYY')
  })

  it('is stable for a given payout', () => {
    // Derived from the payout rather than a counter, so it cannot drift from
    // the thing it names and two processes cannot mint the same one.
    expect(invoiceNumber(payout)).toBe(invoiceNumber(payout))
    expect(invoiceNumber({ ...payout, id: 'ppay_other123' })).not.toBe(invoiceNumber(payout))
  })
})
