/**
 * The order-confirmation contract (docs/ORDER_CONFIRMATION_SPEC.md).
 *
 * The assertions that matter most are the ones about what does NOT happen:
 * confirmation is never granted on the strength of a URL, an unknown session is
 * indistinguishable from a tampered one, and a payment still clearing is never
 * reported as a failure.
 */
import {
  RECOVERY,
  deliveryEstimate,
  maskEmail,
  resolveConfirmation,
  resolveVariant,
  stateForSession,
  toConfirmationOrder,
  toConfirmationSubscription,
} from '@/lib/orders/confirmation'
import { createOrderFromCheckout, markAnalyticsReported, newOrderReference, orderReference } from '@/lib/orders/service'
import type { MemberSubscription } from '@/lib/recharge/types'

const line = { sku: 'X', productId: 'x', title: 'Whey', variantTitle: 'Vanilla', quantity: 2, unitPrice: 24 }

describe('payment status mapping (OC-F-012)', () => {
  it('treats paid and no-payment-required as confirmed', () => {
    expect(stateForSession({ payment_status: 'paid', status: 'complete' })).toBe('confirmed')
    // 100% discount or a trial — no money moved, but the order is real.
    expect(stateForSession({ payment_status: 'no_payment_required', status: 'complete' })).toBe('confirmed')
  })

  it('treats an unpaid but open session as processing, not failure', () => {
    // Bacs, bank transfer, Klarna. Their money may well be on its way; telling
    // them it failed is the worse error (OC-E-005).
    expect(stateForSession({ payment_status: 'unpaid', status: 'open' })).toBe('processing')
  })

  it('treats an expired unpaid session as recovery', () => {
    expect(stateForSession({ payment_status: 'unpaid', status: 'expired' })).toBe('recovery')
  })

  it('defaults to processing rather than confirmed when the status is unrecognised', () => {
    // Whatever a future Stripe version sends, it must not read as "paid".
    expect(stateForSession({})).not.toBe('confirmed')
  })
})

describe('variant resolution (§2.1)', () => {
  it('resolves each variant from what the order actually is', () => {
    expect(resolveVariant({ isSubscription: true, hasPersonalisation: true, hasBundleLines: true, hasStandardLines: false }))
      .toBe('personalised_subscription')
    expect(resolveVariant({ isSubscription: true, hasPersonalisation: false, hasBundleLines: true, hasStandardLines: false }))
      .toBe('standard_subscription')
    expect(resolveVariant({ isSubscription: false, hasPersonalisation: true, hasBundleLines: true, hasStandardLines: false }))
      .toBe('personalised_bundle')
    expect(resolveVariant({ isSubscription: false, hasPersonalisation: true, hasBundleLines: true, hasStandardLines: true }))
      .toBe('mixed')
    expect(resolveVariant({ isSubscription: false, hasPersonalisation: false, hasBundleLines: false, hasStandardLines: true }))
      .toBe('standard')
  })

  it('falls back to standard when personalisation is missing (OC-F-001)', () => {
    // The personalisation service being down must downgrade the variant, never
    // produce an error state.
    expect(resolveVariant({ isSubscription: false, hasPersonalisation: false, hasBundleLines: true, hasStandardLines: false }))
      .toBe('standard')
  })

  it('someone who took the quiz but bought unrelated items gets no personalisation (OC-E-001)', () => {
    expect(resolveVariant({ isSubscription: false, hasPersonalisation: false, hasBundleLines: false, hasStandardLines: true }))
      .toBe('standard')
  })
})

describe('minimal disclosure (OC-F-020, OC-F-021, OC-D-006)', () => {
  it('masks the email enough to spot a typo but not to read it', () => {
    expect(maskEmail('lewis@gmail.com')).toBe('l•••@gmail.com')
    expect(maskEmail(null)).toBeNull()
    expect(maskEmail('not-an-email')).toBeNull()
  })

  it('shows a customer reference, never internal or Stripe ids', async () => {
    const order = await createOrderFromCheckout({
      channel: 'shop',
      lines: [line],
      status: 'paid',
      email: 'lewis@gmail.com',
      stripeSessionId: 'cs_test_SECRET',
      stripePaymentIntentId: 'pi_test_SECRET',
    })
    const view = toConfirmationOrder(order)

    expect(view.reference).toMatch(/^CHRGD-[0-9A-Z]{8}$/)
    const serialised = JSON.stringify(view)
    expect(serialised).not.toContain('cs_test_SECRET')
    expect(serialised).not.toContain('pi_test_SECRET')
    expect(serialised).not.toContain(order.id)
    expect(serialised).not.toContain('lewis@gmail.com')
  })

  it('generates references that do not leak order volume', () => {
    // Sequential references tell anyone who buys twice how many orders you take,
    // and let a stranger walk the range (OC-E-007).
    const refs = new Set(Array.from({ length: 200 }, () => newOrderReference()))
    expect(refs.size).toBe(200)
  })

  it('falls back to the internal id for orders written before references existed', () => {
    expect(orderReference({ id: 'ord_legacy' })).toBe('ord_legacy')
  })
})

describe('the order view is a snapshot, not the live catalogue (OC-E-010)', () => {
  it('renders totals and prices as charged', async () => {
    const order = await createOrderFromCheckout({ channel: 'shop', lines: [line], status: 'paid' })
    const view = toConfirmationOrder(order)
    // Minor units throughout — 2 × £24.
    expect(view.lineItems[0].unitAmount).toBe(2400)
    expect(view.lineItems[0].qty).toBe(2)
    expect(view.totals.total).toBe(4800)
    expect(view.currency).toBe('GBP')
  })

  it('reports a refund on revisit (OC-E-006)', async () => {
    const order = await createOrderFromCheckout({ channel: 'shop', lines: [line], status: 'refunded' })
    expect(toConfirmationOrder(order).refunded).toBe(true)
  })

  it('gives a delivery window rather than a promised date (OC-F-023)', () => {
    const est = deliveryEstimate('2026-08-03T10:00:00Z')
    expect(est).toEqual({ from: '2026-08-06', to: '2026-08-08' })
  })
})

describe('subscription summary (OC-F-040, OC-F-044)', () => {
  const sub = (over: Partial<MemberSubscription> = {}): MemberSubscription => ({
    id: 's',
    status: 'active',
    customerEmail: 'a@b.c',
    flatMonthly: 70,
    dispatchDayOfMonth: 15,
    minMonths: 1,
    monthsActive: 0,
    startedAt: new Date().toISOString(),
    paymentMethod: null,
    lines: [],
    ...over,
  })

  it('lists each shipping rhythm separately rather than averaging them', () => {
    const view = toConfirmationSubscription(
      sub({
        lines: [
          { deliveryIntervalMonths: 1, productTitle: 'Whey' },
          { deliveryIntervalMonths: 3, productTitle: 'Creatine' },
          { deliveryIntervalMonths: 3, productTitle: 'Greens' },
        ] as MemberSubscription['lines'],
      }),
    )
    expect(view.cadenceGroups).toEqual([
      { label: 'Every month', items: ['Whey'] },
      { label: 'Every 3 months', items: ['Creatine', 'Greens'] },
    ])
  })

  it('states the recurring amount in minor units and a next payment date', () => {
    const view = toConfirmationSubscription(sub())
    expect(view.recurringAmount).toBe(7000)
    expect(view.nextBillingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('confirmation is earned, never assumed', () => {
  const origin = 'https://example.com'

  it('a request with no session resolves to recovery (OC-F-008)', async () => {
    expect(await resolveConfirmation({ origin })).toEqual(RECOVERY)
  })

  it('a mock order id that does not exist resolves to recovery, not success', async () => {
    expect(await resolveConfirmation({ mockOrderId: 'ord_nope', origin })).toEqual(RECOVERY)
  })

  it('the default export state is recovery, so nothing defaults to confirmed', () => {
    expect(RECOVERY.state).toBe('recovery')
    expect(RECOVERY.order).toBeNull()
    expect(RECOVERY.analytics).toBeNull()
  })

  it('resolves a real mock order to a confirmed, renderable payload', async () => {
    const order = await createOrderFromCheckout({
      channel: 'shop',
      lines: [line],
      status: 'paid',
      email: 'a@b.com',
    })
    const result = await resolveConfirmation({ mockOrderId: order.id, origin })

    expect(result.state).toBe('confirmed')
    expect(result.variant).toBe('standard')
    expect(result.order?.reference).toBe(order.reference)
    // Nullable and absent — the client must render without them (OC-D-005).
    expect(result.subscription).toBeNull()
    expect(result.personalisation).toBeNull()
  })

  it('marks a quiz-built order as a personalised bundle', async () => {
    const order = await createOrderFromCheckout({ channel: 'quiz', lines: [line], status: 'paid' })
    const result = await resolveConfirmation({ mockOrderId: order.id, origin })
    expect(result.variant).toBe('personalised_bundle')
  })
})

describe('fire-once conversion (OC-F-090, OC-E-003)', () => {
  it('claims the analytics flag exactly once however many times it is called', async () => {
    const order = await createOrderFromCheckout({ channel: 'shop', lines: [line], status: 'paid' })
    const ref = order.reference!

    const claims = [
      await markAnalyticsReported(ref),
      await markAnalyticsReported(ref),
      await markAnalyticsReported(ref),
    ]
    // Exactly one caller is told to report — the rest are refreshes, second
    // tabs, or the customer opening the link on their phone.
    expect(claims.filter(Boolean)).toHaveLength(1)
  })

  it('reports the flag back on subsequent resolutions', async () => {
    const order = await createOrderFromCheckout({ channel: 'shop', lines: [line], status: 'paid' })
    await markAnalyticsReported(order.reference!)
    const again = await resolveConfirmation({ mockOrderId: order.id, origin: 'https://example.com' })
    expect(again.analytics?.alreadyReported).toBe(true)
  })

  it('ignores an unknown reference rather than throwing', async () => {
    expect(await markAnalyticsReported('CHRGD-NOTAREAL')).toBe(false)
  })
})
