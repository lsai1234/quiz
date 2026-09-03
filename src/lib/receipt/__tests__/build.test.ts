/**
 * What may be printed, and when.
 *
 * A receipt is the most quotable thing a checkout produces — it gets
 * screenshotted, forwarded and quoted back at us — so these tests are almost
 * entirely about restraint: no approval stamp without a settled charge, no
 * total that its own line items don't reach, and nothing at all printed for an
 * order the server hasn't confirmed.
 */
import {
  receiptFromConfirmation,
  receiptFromStackCheckout,
  receiptFromDemoBundle,
  receiptItemsFromSlots,
  demoReference,
  money,
} from '../build'
import type { ConfirmationResponse } from '@/lib/orders/confirmation'
import type { SubscriptionCheckout } from '@/lib/stack-blueprint/checkout'

function confirmation(over: Partial<ConfirmationResponse> = {}): ConfirmationResponse {
  return {
    state: 'confirmed',
    variant: 'standard',
    order: {
      reference: 'CHRGD-4F21',
      placedAt: '2026-08-13T12:00:00.000Z',
      emailMasked: 'l•••@gmail.com',
      currency: 'GBP',
      totals: { subtotal: 7200, discount: 720, shipping: 0, tax: 0, total: 6480 },
      lineItems: [
        { sku: 'CRE-1', name: 'Creatine Monohydrate', qty: 1, unitAmount: 2400, isBundleComponent: false },
        { sku: 'WHY-1', name: 'Whey Protein', qty: 2, unitAmount: 2400, isBundleComponent: false },
      ],
      shippingAddress: {
        name: 'Sam Reed',
        line1: '14 Bridge St',
        line2: null,
        city: 'Manchester',
        postcode: 'M1 1AA',
        country: 'GB',
      },
      deliveryEstimate: { from: '2026-08-15T00:00:00.000Z', to: '2026-08-18T00:00:00.000Z' },
      status: 'paid',
    },
    subscription: null,
    personalisation: null,
    analytics: null,
    ...over,
  }
}

const subscriptionCheckout: SubscriptionCheckout = {
  lines: [
    {
      productId: 'p1',
      productTitle: 'Creatine Monohydrate',
      variantId: 'v1',
      quantity: 1,
      deliveryIntervalMonths: 2,
      pricePerDelivery: 24,
      attributes: [],
    },
    {
      productId: 'p2',
      productTitle: 'Whey Protein',
      variantId: 'v2',
      quantity: 1,
      deliveryIntervalMonths: 1,
      pricePerDelivery: 36,
      attributes: [],
    },
  ],
  flatMonthly: 48,
  firstMonth: 36,
  introDiscountPct: 25,
  minMonths: 3,
  minTermTotal: 132,
}

describe('the confirmed order receipt', () => {
  it('prints nothing at all until the server has confirmed the payment', () => {
    expect(receiptFromConfirmation(confirmation({ state: 'processing' }))).toBeNull()
    expect(receiptFromConfirmation(confirmation({ state: 'recovery', order: null }))).toBeNull()
  })

  it('itemises what was bought, at the amount charged for the quantity', () => {
    const receipt = receiptFromConfirmation(confirmation())!
    expect(receipt.items).toEqual([
      { name: 'Creatine Monohydrate', qty: 1, amount: '£24.00' },
      { name: 'Whey Protein', qty: 2, amount: '£48.00' },
    ])
  })

  it('lists the items, the discount and the total so the column adds up', () => {
    const receipt = receiptFromConfirmation(confirmation())!
    expect(receipt.adjustments).toEqual([
      { label: 'Subtotal', value: '£72.00' },
      { label: 'Discount', value: '−£7.20', tone: 'saving' },
      { label: 'Delivery', value: 'FREE', tone: 'saving' },
    ])
    expect(receipt.total).toEqual({ label: 'Total paid', value: '£64.80' })
  })

  it('stamps a settled payment as approved', () => {
    expect(receiptFromConfirmation(confirmation())!.stamp).toBe('Payment approved')
  })

  it('does not claim a payment on a subscription that starts with a free trial', () => {
    const receipt = receiptFromConfirmation(
      confirmation({
        variant: 'standard_subscription',
        subscription: {
          cadenceLabel: 'Monthly',
          recurringAmount: 4800,
          nextBillingDate: '2026-09-13T00:00:00.000Z',
          nextDispatchDate: '2026-08-15T00:00:00.000Z',
          trial: { endsAt: '2026-08-27T00:00:00.000Z', thenAmount: 4800 },
          reference: 'SUB-ABC123',
          startedAt: '2026-08-13T00:00:00.000Z',
          emailMasked: null,
          currency: 'GBP',
          firstPayment: null,
          shippingAddress: null,
          lines: [],
          minMonths: 1,
          manageUrl: null,
          cadenceGroups: [],
        },
      }),
    )!
    expect(receipt.stamp).toBe('Trial started')
    expect(receipt.charge.map((r) => r.label)).toContain('Free trial until')
    expect(receipt.charge.map((r) => r.label)).toContain('Then')
  })

  it('names every delivery rhythm when a plan has more than one', () => {
    const receipt = receiptFromConfirmation(
      confirmation({
        variant: 'standard_subscription',
        subscription: {
          cadenceLabel: 'Monthly',
          recurringAmount: 4800,
          nextBillingDate: null,
          nextDispatchDate: null,
          trial: null,
          reference: 'SUB-ABC123',
          startedAt: '2026-08-13T00:00:00.000Z',
          emailMasked: null,
          currency: 'GBP',
          firstPayment: null,
          shippingAddress: null,
          lines: [],
          minMonths: 1,
          manageUrl: null,
          cadenceGroups: [
            { label: 'Every month', items: ['Whey Protein'] },
            { label: 'Every 2 months', items: ['Creatine Monohydrate'] },
          ],
        },
      }),
    )!
    expect(receipt.notes.join(' ')).toContain('Every 2 months: Creatine Monohydrate')
  })

  it('prints the address it is being sent to, and the window for changing it', () => {
    const receipt = receiptFromConfirmation(confirmation())!
    expect(receipt.shipTo).toEqual(['Sam Reed', '14 Bridge St', 'Manchester M1 1AA'])
    expect(receipt.notes.join(' ')).toContain('within 12 hours')
  })

  it('says so when the order has been refunded, rather than calling it paid', () => {
    const base = confirmation()
    const receipt = receiptFromConfirmation({
      ...base,
      order: { ...base.order!, refunded: true },
    })!
    expect(receipt.total!.label).toBe('Order total')
    expect(receipt.notes.join(' ')).toContain('refund has been issued')
  })
})

describe('the in-page stack checkout receipt', () => {
  it('never stamps a demo checkout as approved', () => {
    const receipt = receiptFromStackCheckout({
      plan: 'oneoff',
      mock: true,
      oneOff: { items: [{ name: 'Creatine', qty: 1, amount: '£24.00' }], subtotal: 24, total: 24 },
    })
    expect(receipt.stamp).toBe('Demo — not charged')
    expect(receipt.total).toEqual({ label: 'Order total', value: '£24.00' })
    expect(receipt.notes.join(' ')).toContain('no payment was taken')
  })

  it('prints a flat monthly plan as a schedule, with no per-line amounts to mis-add', () => {
    const receipt = receiptFromStackCheckout({ plan: 'subscription', subscription: subscriptionCheckout, mock: true })
    expect(receipt.items).toEqual([
      { name: 'Creatine Monohydrate', qty: 1, amount: null, note: 'every 2 months' },
      { name: 'Whey Protein', qty: 1, amount: null, note: 'every month' },
    ])
    expect(receipt.charge).toEqual([
      { label: 'First month (25% off)', value: '£36.00', tone: 'saving' },
      { label: 'Then per month', value: '£48.00/mo' },
      { label: '3-month minimum', value: '£132.00', tone: 'muted' },
    ])
  })

  it('shows a one-off stack its saving, derived from the total actually charged', () => {
    const receipt = receiptFromStackCheckout({
      plan: 'oneoff',
      mock: false,
      oneOff: {
        items: [{ name: 'Creatine', qty: 1, amount: '£24.00' }],
        subtotal: 80,
        total: 72,
      },
    })
    expect(receipt.adjustments).toEqual([
      { label: 'Subtotal', value: '£80.00' },
      { label: 'Discount', value: '−£8.00', tone: 'saving' },
    ])
    expect(receipt.total).toEqual({ label: 'Total paid', value: '£72.00' })
  })

  it('confirms the unavailability choice the member made in the journey', () => {
    const removes = receiptFromStackCheckout({
      plan: 'subscription',
      subscription: subscriptionCheckout,
      changePolicy: 'remove',
      mock: true,
    })
    expect(removes.notes.join(' ')).toContain('take it off your plan')

    const swaps = receiptFromStackCheckout({
      plan: 'subscription',
      subscription: subscriptionCheckout,
      changePolicy: 'auto-swap',
      mock: true,
    })
    expect(swaps.notes.join(' ')).toContain('closest match')
  })
})

describe('the scroll story bundle receipt', () => {
  it('is a demo whatever the catalogue is set to — that journey takes no money', () => {
    const receipt = receiptFromDemoBundle({
      items: [{ name: 'Creatine', qty: 1, amount: '£24.00/mo' }],
      subtotal: 24,
      discount: 2.4,
      discountPct: 10,
      total: 21.6,
      stackName: 'The Builder',
    })
    expect(receipt.stamp).toBe('Demo — not charged')
    expect(receipt.total).toEqual({ label: 'Monthly total', value: '£21.60/mo' })
    expect(receipt.meta.map((r) => r.value)).toContain('The Builder')
  })
})

describe('the shared printing rules', () => {
  it('formats money in the currency actually charged', () => {
    expect(money(6480, 'GBP')).toBe('£64.80')
    expect(money(6480, 'EUR')).toContain('64.80')
  })

  it('marks a demo reference as one, so support can never mistake it for an order', () => {
    expect(demoReference(new Date('2026-08-13T12:00:00.000Z'))).toMatch(/^DEMO-[0-9A-Z]{6}$/)
  })

  it('prices a stack line from the variant the checkout would send', () => {
    const items = receiptItemsFromSlots(
      [
        { slotId: 's1', slotType: 'protein', title: 'Protein', selectedProductId: 'p1', selectedVariantId: 'v2', displayOrder: 0 },
      ] as never,
      [
        {
          id: 'p1',
          title: 'Whey Protein',
          basePrice: 30,
          variants: [
            { id: 'v1', price: 30, available: true },
            { id: 'v2', price: 42, available: true },
          ],
        },
      ] as never,
    )
    expect(items).toEqual([{ name: 'Whey Protein', qty: 1, amount: '£42.00' }])
  })
})

describe('a subscription that has no order yet', () => {
  /**
   * The gap this fills: a subscription signup arrives at the confirmation screen
   * BEFORE any order exists — the first box's order is raised later, by the
   * `invoice.paid` webhook, under its own id. `receiptFromConfirmation` returned
   * null on `!order`, so the one journey that ends in a recurring commitment was
   * the only one that printed no paperwork at all.
   */
  function plan(over: Record<string, unknown> = {}) {
    return confirmation({
      variant: 'standard_subscription',
      order: null,
      subscription: {
        cadenceLabel: 'Every month',
        recurringAmount: 5218,
        nextBillingDate: '2026-09-15T00:00:00.000Z',
        nextDispatchDate: '2026-09-15T00:00:00.000Z',
        trial: null,
        manageUrl: null,
        cadenceGroups: [],
        reference: 'SUB-7F3A91',
        startedAt: '2026-08-14T00:00:00.000Z',
        emailMasked: 'l•••@gmail.com',
        currency: 'GBP',
        firstPayment: 4174,
        shippingAddress: null,
        lines: [
          { name: 'CHRGD Recover', qty: 1, cadenceMonths: 2 },
          { name: 'Creatine', qty: 1, cadenceMonths: 1 },
        ],
        minMonths: 1,
        ...over,
      },
    })
  }

  it('prints one, rather than nothing', () => {
    const receipt = receiptFromConfirmation(plan())
    expect(receipt).not.toBeNull()
    expect(receipt!.docTitle).toBe('Subscription receipt')
    expect(receipt!.reference).toBe('SUB-7F3A91')
  })

  it('shows what was actually charged today, not the monthly', () => {
    // Month one carries the intro rate and the partner's code. Printing the
    // plan's monthly here would state a charge that never happened.
    const receipt = receiptFromConfirmation(plan())!
    expect(receipt.total).toEqual({ label: 'Charged today', value: '£41.74' })
    expect(receipt.charge).toContainEqual({ label: 'Recurring every month', value: '£52.18' })
  })

  it('prints no total at all when Stripe did not say what it took', () => {
    const receipt = receiptFromConfirmation(plan({ firstPayment: null }))!
    expect(receipt.total).toBeNull()
    // Still stamped: this branch is only reached once Stripe said the session is paid.
    expect(receipt.stamp).toBe('Payment approved')
  })

  it('lists the plan as a schedule, with no amounts to mis-add', () => {
    const receipt = receiptFromConfirmation(plan())!
    expect(receipt.items).toEqual([
      { name: 'CHRGD Recover', qty: 1, amount: null, note: 'every 2 months' },
      { name: 'Creatine', qty: 1, amount: null, note: 'every month' },
    ])
  })

  it('still refuses to print before the server has confirmed', () => {
    expect(receiptFromConfirmation({ ...plan(), state: 'processing' })).toBeNull()
  })

  it('names a minimum term when there is one', () => {
    const receipt = receiptFromConfirmation(plan({ minMonths: 3 }))!
    expect(receipt.notes.join(' ')).toContain('3-month minimum term')
  })
})
