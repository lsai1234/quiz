/**
 * What a partner sees about themselves — and, more to the point, only about
 * themselves.
 */
import { createPartner, changeTerms } from '@/lib/partners'
import { dashboardFor } from '@/lib/partners/dashboard'
import { confirmDue } from '@/lib/partners/ledger'
import { createOrderFromCheckout } from '@/lib/orders/service'
import { PRICING_CONFIG } from '@/lib/stack-blueprint/pricing'

async function orderOn(code: string, unitPrice = 90) {
  return createOrderFromCheckout({
    channel: 'shop',
    status: 'paid',
    email: 'buyer@example.com',
    lines: [{ sku: 's1', productId: 'p1', title: 'Whey', quantity: 1, unitPrice, supplierCost: 20 }],
    partnerCode: code,
    partnerDiscountPct: 0.2,
  })
}

describe('a partner’s own dashboard', () => {
  it('answers what am I on, what am I owed, and when do I get it', async () => {
    const partner = await createPartner({ email: 'dash@example.com', name: 'Dash Person' })
    await orderOn(partner.codes[0].code)

    const d = (await dashboardFor(partner.partner.id))!

    // What am I on
    expect(d.wording.earn).toMatch(/of the net on a first order/)
    expect(d.wording.paid).toMatch(/Monthly in arrears/)
    expect(d.terms.firstOrderPct).toBe(PRICING_CONFIG.partners.firstOrderPct)

    // What am I owed
    expect(d.balance.accrued).toBeGreaterThan(0)
    expect(d.balance.payableNow).toBe(0)

    // When do I get it — on the row itself, not a policy line elsewhere.
    expect(d.earnings).toHaveLength(1)
    expect(d.earnings[0].state).toBe('accrued')
    expect(new Date(d.earnings[0].payableFrom).getTime()).toBeGreaterThan(Date.now())
  })

  it('shows only this partner’s numbers', async () => {
    const mine = await createPartner({ email: 'mine@example.com', name: 'Mine Person' })
    const theirs = await createPartner({ email: 'theirs@example.com', name: 'Theirs Person' })

    await orderOn(mine.codes[0].code)
    await orderOn(theirs.codes[0].code)
    await orderOn(theirs.codes[0].code, 120)

    const d = (await dashboardFor(mine.partner.id))!
    expect(d.earnings).toHaveLength(1)
    expect(d.totals.orders).toBe(1)
    expect(d.codes.map((c) => c.code)).toEqual([mine.codes[0].code])
  })

  it('counts this month separately from all time', async () => {
    const partner = await createPartner({ email: 'month@example.com', name: 'Month Person' })
    await orderOn(partner.codes[0].code)

    const d = (await dashboardFor(partner.partner.id))!
    // Everything written in this test run is this month.
    expect(d.thisMonth.orders).toBe(1)
    expect(d.thisMonth.earned).toBeGreaterThan(0)
    expect(d.totals.orders).toBe(1)
  })

  it('moves money to payable once the window has passed', async () => {
    const partner = await createPartner({ email: 'cleared@example.com', name: 'Cleared Person' })
    await orderOn(partner.codes[0].code)
    await confirmDue(new Date(Date.now() + 30 * 24 * 3600 * 1000))

    const d = (await dashboardFor(partner.partner.id))!
    expect(d.balance.payableNow).toBeGreaterThan(0)
    expect(d.earnings[0].state).toBe('confirmed')
  })

  it('carries the whole dated history, newest first, with the reasons', async () => {
    // The point of `partner_terms` being append-only: a partner who can see
    // that their rate changed, and why, does not have to take our word for it.
    const partner = await createPartner({ email: 'hist2@example.com', name: 'Hist Two' })
    await changeTerms(partner.partner.id, {
      firstOrderPct: 0.25,
      renewalPct: 0.08,
      renewalMonths: 6,
      payout: partner.terms.payout,
      effectiveFrom: new Date(Date.now() + 1000).toISOString(),
      note: 'Bumped for the launch.',
    })

    const d = (await dashboardFor(partner.partner.id))!
    expect(d.termsHistory).toHaveLength(2)
    expect(d.termsHistory[0].note).toBe('Bumped for the launch.')
  })

  it('is nothing for a partner who does not exist', async () => {
    expect(await dashboardFor('ptnr_nope')).toBeNull()
  })
})
