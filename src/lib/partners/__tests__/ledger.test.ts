/**
 * The commission ledger, against the real (in-memory) database — so the unique
 * index that makes accrual idempotent is exercised rather than assumed.
 */
import { createPartner, changeTerms } from '@/lib/partners'
import {
  accrueForOrder,
  balanceFor,
  confirmDue,
  invoiceFor,
  markPaid,
  reverseForOrder,
  runPayouts,
  settle,
  summariseBalance,
} from '@/lib/partners/ledger'
import * as repo from '@/lib/partners/repo'
import { PRICING_CONFIG } from '@/lib/stack-blueprint/pricing'
import { createOrderFromCheckout } from '@/lib/orders/service'
import { refundOrder } from '@/lib/orders/service'
import type { Order } from '@/lib/orders/types'

/** A healthy £90 order that can comfortably carry a commission. */
async function paidOrder(code: string, over: Partial<Order> = {}): Promise<Order> {
  const order = await createOrderFromCheckout({
    channel: 'shop',
    status: 'paid',
    email: 'buyer@example.com',
    lines: [{ sku: 's1', productId: 'p1', title: 'Whey', quantity: 1, unitPrice: 90, supplierCost: 20 }],
    partnerCode: code,
    partnerDiscountPct: 0.2,
  })
  if (Object.keys(over).length) {
    const { saveOrder } = await import('@/lib/orders/repo')
    Object.assign(order, over)
    await saveOrder(order)
  }
  return order
}

describe('accruing on a paid order', () => {
  it('records what was earned, at the rate in force', async () => {
    const partner = await createPartner({ email: 'acc@example.com', name: 'Acc Person' })
    const order = await paidOrder(partner.codes[0].code)

    const rows = await repo.listCommissions(partner.partner.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('first')
    expect(rows[0].rate).toBe(PRICING_CONFIG.partners.firstOrderPct)
    expect(rows[0].state).toBe('accrued')
    expect(rows[0].orderId).toBe(order.id)
    expect(rows[0].amount).toBeGreaterThan(0)
  })

  it('stores the rate rather than looking it up later', async () => {
    // Change a rate next quarter and last quarter's ledger must not restate.
    const partner = await createPartner({ email: 'frozen@example.com', name: 'Frozen Person' })
    await paidOrder(partner.codes[0].code)

    await changeTerms(partner.partner.id, {
      firstOrderPct: 0.4,
      renewalPct: 0.1,
      renewalMonths: 6,
      payout: partner.terms.payout,
      effectiveFrom: new Date(Date.now() + 1000).toISOString(),
      note: 'Doubled for a campaign.',
    })

    const rows = await repo.listCommissions(partner.partner.id)
    expect(rows[0].rate).toBe(PRICING_CONFIG.partners.firstOrderPct)
  })

  it('does not pay twice for a redelivered webhook', async () => {
    // Enforced by the unique index on (order_id, kind), not by checking first:
    // Stripe delivers webhooks more than once and two can land together, so a
    // read-then-write would still double-pay under a race.
    const partner = await createPartner({ email: 'dupe@example.com', name: 'Dupe Person' })
    const order = await paidOrder(partner.codes[0].code)

    const again = await accrueForOrder(order, {})
    expect(again.commission).toBeNull()
    expect(again.reason).toMatch(/already accrued/i)
    expect(await repo.listCommissions(partner.partner.id)).toHaveLength(1)
  })

  it('says why, rather than silently writing nothing', async () => {
    const order = await paidOrder('NOSUCHCODE')
    const result = await accrueForOrder(order, {})
    expect(result.commission).toBeNull()
    expect(result.reason).toMatch(/No code NOSUCHCODE/)
  })

  it('lets a partner use their own code but not earn on it', async () => {
    // The discount is theirs to use — they are a customer like anyone else. What
    // they cannot do is pay themselves commission, which would turn the code
    // into a standing extra discount funded out of the programme.
    const partner = await createPartner({ email: 'self@example.com', name: 'Self Person' })
    const order = await createOrderFromCheckout({
      channel: 'shop',
      status: 'paid',
      email: 'self@example.com',
      lines: [{ sku: 's1', productId: 'p1', title: 'Whey', quantity: 1, unitPrice: 90, supplierCost: 20 }],
      partnerCode: partner.codes[0].code,
      partnerDiscountPct: 0.2,
    })

    // The order stands, discount and all.
    expect(order.partnerCode).toBe(partner.codes[0].code)
    expect(order.partnerDiscountPct).toBe(0.2)
    // The commission does not.
    expect(await repo.listCommissions(partner.partner.id)).toHaveLength(0)

    const result = await accrueForOrder(order, {})
    expect(result.commission).toBeNull()
    expect(result.reason).toMatch(/their own order/i)
  })

  it('is not fooled by casing or whitespace on the email', async () => {
    const partner = await createPartner({ email: 'case-self@example.com', name: 'Case Self' })
    const order = await createOrderFromCheckout({
      channel: 'shop',
      status: 'paid',
      email: '  Case-Self@Example.com ',
      lines: [{ sku: 's1', productId: 'p1', title: 'Whey', quantity: 1, unitPrice: 90, supplierCost: 20 }],
      partnerCode: partner.codes[0].code,
    })
    expect((await accrueForOrder(order, {})).reason).toMatch(/their own order/i)
  })

  it('earns nothing on an order that was already losing money', async () => {
    const partner = await createPartner({ email: 'thin@example.com', name: 'Thin Person' })
    const order = await createOrderFromCheckout({
      channel: 'shop',
      status: 'paid',
      lines: [{ sku: 's', productId: 'p', title: 'Loss', quantity: 1, unitPrice: 20, supplierCost: 15 }],
      partnerCode: partner.codes[0].code,
    })
    const result = await accrueForOrder(order, {})
    expect(result.commission).toBeNull()
    expect(result.reason).toMatch(/nothing to share/)
  })
})

describe('renewals', () => {
  it('earn the renewal rate inside the window', async () => {
    const partner = await createPartner({ email: 'ren@example.com', name: 'Ren Person' })
    const order = await createOrderFromCheckout({
      channel: 'subscription',
      status: 'paid',
      lines: [{ sku: 's', productId: 'p', title: 'Box', quantity: 1, unitPrice: 90, supplierCost: 20 }],
      partnerCode: partner.codes[0].code,
    })

    // Wipe the accrual the order write already made, so this test controls it.
    for (const r of await repo.listCommissionsForOrder(order.id)) {
      await repo.setCommissionState(r.id, ['accrued'], 'reversed')
    }

    const result = await accrueForOrder(
      { ...order, id: `${order.id}-renewal` },
      { signupAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(), isFirstForMember: false },
    )
    expect(result.commission?.kind).toBe('renewal')
    expect(result.commission?.rate).toBe(PRICING_CONFIG.partners.renewalPct)
  })

  it('stop earning past the window, and say so', async () => {
    const partner = await createPartner({ email: 'expired@example.com', name: 'Expired Person' })
    const order = await createOrderFromCheckout({
      channel: 'subscription',
      status: 'paid',
      lines: [{ sku: 's', productId: 'p', title: 'Box', quantity: 1, unitPrice: 90, supplierCost: 20 }],
      partnerCode: partner.codes[0].code,
    })

    const result = await accrueForOrder(
      { ...order, id: `${order.id}-late` },
      { signupAt: '2020-01-01T00:00:00.000Z', isFirstForMember: false },
    )
    expect(result.commission).toBeNull()
    expect(result.reason).toMatch(/renewal window/)
  })
})

describe('the return window', () => {
  it('keeps a fresh accrual out of the payable balance', async () => {
    const partner = await createPartner({ email: 'window@example.com', name: 'Window Person' })
    await paidOrder(partner.codes[0].code)

    const balance = await balanceFor(partner.partner.id)
    expect(balance.accrued).toBeGreaterThan(0)
    expect(balance.confirmed).toBe(0)
    // An accrual could still be refunded away — showing it as owed would promise
    // a partner money that may never be theirs.
    expect(balance.payableNow).toBe(0)
  })

  it('confirms what has passed it, and nothing that has not', async () => {
    const partner = await createPartner({ email: 'confirm@example.com', name: 'Confirm Person' })
    await paidOrder(partner.codes[0].code)

    // Nothing is due yet, so today's run leaves this partner untouched.
    await confirmDue(new Date())
    expect((await balanceFor(partner.partner.id)).payableNow).toBe(0)

    // `confirmDue` sweeps the whole ledger, so assert on THIS partner rather
    // than a global count that other tests in this file also contribute to.
    const past = new Date(Date.now() + (PRICING_CONFIG.partners.confirmAfterDays + 1) * 24 * 3600 * 1000)
    await confirmDue(past)

    const balance = await balanceFor(partner.partner.id)
    expect(balance.accrued).toBe(0)
    expect(balance.payableNow).toBeGreaterThan(0)
  })

  it('is idempotent — a second run the same day moves nothing', async () => {
    const partner = await createPartner({ email: 'twice@example.com', name: 'Twice Person' })
    await paidOrder(partner.codes[0].code)
    const past = new Date(Date.now() + 30 * 24 * 3600 * 1000)

    expect(await confirmDue(past)).toBeGreaterThanOrEqual(1)
    expect(await confirmDue(past)).toBe(0)
  })
})

describe('a refund', () => {
  it('reverses the commission through the order service', async () => {
    const partner = await createPartner({ email: 'refund@example.com', name: 'Refund Person' })
    const order = await paidOrder(partner.codes[0].code)

    await refundOrder(order.id, 'Customer changed their mind')

    const rows = await repo.listCommissions(partner.partner.id)
    expect(rows[0].state).toBe('reversed')
    const balance = await balanceFor(partner.partner.id)
    expect(balance.payableNow).toBe(0)
    // Shown, never hidden.
    expect(balance.reversed).toBeGreaterThan(0)
  })

  it('reverses even after the money has been paid', async () => {
    // It has to be visible as reversed rather than quietly absent. Recovering it
    // is a conversation, not a database write — which is why the return window
    // exists to make this rare.
    const partner = await createPartner({ email: 'late-refund@example.com', name: 'Late Refund' })
    const order = await paidOrder(partner.codes[0].code)
    await confirmDue(new Date(Date.now() + 30 * 24 * 3600 * 1000))
    const run = await settle(partner.partner.id, '2026-08', { ignoreMinimum: true })
    await markPaid('payoutId' in run ? run.payoutId! : '', 'BACS-123')

    expect((await repo.listCommissions(partner.partner.id))[0].state).toBe('paid')

    expect(await reverseForOrder(order.id)).toBe(1)
    expect((await repo.listCommissions(partner.partner.id))[0].state).toBe('reversed')
  })

  it('leaves a reversed row alone when the payout is later marked paid', async () => {
    // Money simply is not sent for it. Paying it out from under the reversal
    // would be the ledger disagreeing with the bank.
    const partner = await createPartner({ email: 'midrun@example.com', name: 'Midrun Person' })
    const order = await paidOrder(partner.codes[0].code)
    await confirmDue(new Date(Date.now() + 30 * 24 * 3600 * 1000))
    const run = await settle(partner.partner.id, '2026-08', { ignoreMinimum: true })
    const payoutId = 'payoutId' in run ? run.payoutId! : ''

    await reverseForOrder(order.id)
    expect(await markPaid(payoutId, 'BACS-456')).toBe(0)
    expect((await repo.listCommissions(partner.partner.id))[0].state).toBe('reversed')
  })
})

describe('settling a payout', () => {
  it('raises an obligation — it does NOT send money', async () => {
    // "We owe you this" and "we have sent you this" are different facts. The
    // ledger used to claim money had moved the moment a founder pressed a
    // button, which is a lie the bank statement eventually contradicts.
    const partner = await createPartner({ email: 'payout@example.com', name: 'Payout Person' })
    await paidOrder(partner.codes[0].code)
    await confirmDue(new Date(Date.now() + 30 * 24 * 3600 * 1000))

    const result = await settle(partner.partner.id, '2026-08', { ignoreMinimum: true })
    expect('payoutId' in result && result.payoutId).toBeTruthy()
    expect('rows' in result && result.rows).toBe(1)

    const rows = await repo.listCommissions(partner.partner.id)
    expect(rows[0].state).toBe('invoiced')
    expect(rows[0].payoutId).toBeTruthy()

    const balance = await balanceFor(partner.partner.id)
    expect(balance.payableNow).toBe(0)
    expect(balance.invoiced).toBeGreaterThan(0)
    expect(balance.paid).toBe(0)
  })

  it('marks the rows paid only when the money actually goes', async () => {
    const partner = await createPartner({ email: 'sent@example.com', name: 'Sent Person' })
    await paidOrder(partner.codes[0].code)
    await confirmDue(new Date(Date.now() + 30 * 24 * 3600 * 1000))
    const run = await settle(partner.partner.id, '2026-08', { ignoreMinimum: true })
    const payoutId = 'payoutId' in run ? run.payoutId! : ''

    expect(await markPaid(payoutId, 'BACS-789')).toBe(1)

    const balance = await balanceFor(partner.partner.id)
    expect(balance.invoiced).toBe(0)
    expect(balance.paid).toBeGreaterThan(0)

    const payout = await repo.getPayout(payoutId)
    expect(payout?.state).toBe('paid')
    // The reference is what answers "did this arrive" months later.
    expect(payout?.reference).toBe('BACS-789')
  })

  it('does not pick the same rows up on a second run', async () => {
    const partner = await createPartner({ email: 'twice-run@example.com', name: 'Twice Run' })
    await paidOrder(partner.codes[0].code)
    await confirmDue(new Date(Date.now() + 30 * 24 * 3600 * 1000))

    await settle(partner.partner.id, '2026-08', { ignoreMinimum: true })
    const again = await settle(partner.partner.id, '2026-09', { ignoreMinimum: true })
    expect('reason' in again && again.reason).toMatch(/Nothing confirmed/)
  })

  it('carries a balance forward below the agreed minimum', async () => {
    const partner = await createPartner({ email: 'small@example.com', name: 'Small Person' })
    await paidOrder(partner.codes[0].code)
    await confirmDue(new Date(Date.now() + 30 * 24 * 3600 * 1000))

    // The default minimum is £25 and one £90 order earns well under it.
    const result = await settle(partner.partner.id, '2026-08')
    expect('reason' in result && result.reason).toMatch(/carries forward/)
    expect((await repo.listCommissions(partner.partner.id))[0].state).toBe('confirmed')
  })

  it('has nothing to do when nothing is confirmed', async () => {
    const partner = await createPartner({ email: 'empty@example.com', name: 'Empty Person' })
    const result = await settle(partner.partner.id, '2026-08')
    expect('reason' in result && result.reason).toMatch(/Nothing confirmed/)
  })
})

describe('the balance a partner sees', () => {
  it('splits by how settled the money is, and only owes what is confirmed', () => {
    const rows = [
      { state: 'accrued', amount: 10 },
      { state: 'confirmed', amount: 20 },
      { state: 'invoiced', amount: 25 },
      { state: 'paid', amount: 30 },
      { state: 'reversed', amount: 40 },
    ] as Parameters<typeof summariseBalance>[0]

    expect(summariseBalance(rows)).toEqual({
      accrued: 10,
      confirmed: 20,
      invoiced: 25,
      paid: 30,
      reversed: 40,
      // NOT 45. An invoiced row is already on a raised payout, and counting it
      // here would let the next run pay the same money twice.
      payableNow: 20,
    })
  })
})

describe('the monthly run', () => {
  it('pays everyone over their own bar and names everyone it skips', async () => {
    const rich = await createPartner({ email: 'rich@example.com', name: 'Rich Person' })
    const poor = await createPartner({ email: 'poor@example.com', name: 'Poor Person' })

    // Four healthy orders clears the £25 default; one does not.
    for (let i = 0; i < 4; i++) await paidOrder(rich.codes[0].code)
    await paidOrder(poor.codes[0].code)
    await confirmDue(new Date(Date.now() + 30 * 24 * 3600 * 1000))

    const report = await runPayouts('2026-08')

    const paidRich = report.paid.find((p) => p.partnerId === rich.partner.id)
    expect(paidRich).toBeTruthy()
    expect(paidRich!.amount).toBeGreaterThanOrEqual(25)

    const skippedPoor = report.skipped.find((p) => p.partnerId === poor.partner.id)
    expect(skippedPoor).toBeTruthy()
    expect(skippedPoor!.reason).toMatch(/carries forward/)

    // And the skipped balance is still there, waiting.
    expect((await balanceFor(poor.partner.id)).payableNow).toBeGreaterThan(0)
  })

  it('does not clutter the report with partners who earned nothing', async () => {
    await createPartner({ email: 'idle@example.com', name: 'Idle Person' })
    const report = await runPayouts('2026-08')
    expect(report.skipped.some((s) => s.name === 'Idle Person')).toBe(false)
  })
})

describe('the self-billed invoice', () => {
  it('is built from the rows, and says it is self-billed', async () => {
    const partner = await createPartner({ email: 'inv@example.com', name: 'Inv Person' })
    await paidOrder(partner.codes[0].code)
    await paidOrder(partner.codes[0].code)
    await confirmDue(new Date(Date.now() + 30 * 24 * 3600 * 1000))
    const run = await settle(partner.partner.id, '2026-08', { ignoreMinimum: true })

    const invoice = (await invoiceFor('payoutId' in run ? run.payoutId! : ''))!
    expect(invoice.number).toMatch(/^CHRGD-SB-2026-08-/)
    expect(invoice.selfBilled).toBe(true)
    expect(invoice.notice).toMatch(/self-billed/i)
    expect(invoice.supplier.name).toBe('Inv Person')

    // Two orders at one rate collapse to one line, not two.
    expect(invoice.lines).toHaveLength(1)
    expect(invoice.lines[0].count).toBe(2)
    // And the lines add up to the invoice.
    expect(round2(invoice.lines.reduce((s, l) => s + l.amount, 0))).toBe(invoice.net)
    expect(invoice.gross).toBe(round2(invoice.net + invoice.vat))
  })

  it('adds VAT only for a partner who charges it', async () => {
    const partner = await createPartner({ email: 'vat@example.com', name: 'Vat Person' })
    await changeTerms(partner.partner.id, {
      firstOrderPct: PRICING_CONFIG.partners.firstOrderPct,
      renewalPct: PRICING_CONFIG.partners.renewalPct,
      renewalMonths: 6,
      payout: { ...partner.terms.payout, chargesVat: true },
      // Just after the opening row, which is the earliest `changeTerms` allows.
      effectiveFrom: new Date(Date.now() + 1).toISOString(),
      note: 'They registered for VAT.',
    })

    // The invoice honours the terms in force WHEN THE PAYOUT WAS RAISED, so the
    // payout has to be raised after they take effect. Waited for explicitly
    // rather than assumed: an earlier version of this raced the millisecond and
    // passed alone but failed in a full run.
    await new Promise((resolve) => setTimeout(resolve, 25))

    await paidOrder(partner.codes[0].code)
    await confirmDue(new Date(Date.now() + 30 * 24 * 3600 * 1000))
    const run = await settle(partner.partner.id, '2026-08', { ignoreMinimum: true })

    const invoice = (await invoiceFor('payoutId' in run ? run.payoutId! : ''))!
    // Their commission costs us 20% more than the rate suggests.
    expect(invoice.vatRate).toBe(PRICING_CONFIG.vat.standardRate)
    expect(invoice.vat).toBeGreaterThan(0)
    expect(invoice.gross).toBeGreaterThan(invoice.net)
  })
})

const round2 = (n: number) => Math.round(n * 100) / 100
