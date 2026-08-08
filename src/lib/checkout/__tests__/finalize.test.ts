import { PRICING_CONFIG } from '@/lib/stack-blueprint/pricing'
/**
 * Checkout finalize — persists the member's bundle + quiz to their account and
 * returns a payment URL (mock mode returns a placeholder). Runs against the
 * in-memory DB.
 */
import { finalizeCheckout, claimIntroDiscount, CheckoutRejected } from '../finalize'
import type { CheckoutPayload } from '../types'
import { createUser } from '@/lib/db/users'
import { getSubscription, getQuiz } from '@/lib/db/hub-data'
import { latestConsent } from '@/lib/legal/consent'
import { TERMS_VERSION, DISCLAIMER_VERSION } from '@/lib/legal/content'
import { readIntroLedger, ledgerTotals } from '@/lib/stack-blueprint/intro-allocation'
import type { MemberSubscription } from '@/lib/recharge/types'
import type { QuizAnswers } from '@/lib/types'
import { setPortalPricingOverrides, resetPortalPricing } from '@/lib/portal/store'
import { createPartner, setPartnerStatus } from '@/lib/partners'

// The card is switched off in the live config — a partner's code is the only
// extra discount now. These tests pin the BANKING of a claim, which still has to
// work whenever a card runs, so they turn it on through the portal settings
// (rather than in memory) because `finalizeCheckout` re-hydrates the config from
// there on every call and would wipe an in-memory override.
beforeEach(async () => {
  await setPortalPricingOverrides({
    introOffer: { ...PRICING_CONFIG.introOffer, scratchReveal: { ...PRICING_CONFIG.introOffer.scratchReveal, enabled: true } },
  })
})
afterEach(async () => {
  await resetPortalPricing()
})

// The scratch outcomes, from config — these tests pin the banking of a claim,
// not which cards are on offer this month.
const CARDS = [...PRICING_CONFIG.introOffer.scratchReveal.outcomes]
  .map((o) => o.discount)
  .sort((a, b) => b - a)
const [TOP, MID] = CARDS

const subscription = {
  id: 'sub-x',
  status: 'active',
  customerEmail: '',
  flatMonthly: 42,
  dispatchDayOfMonth: 15,
  minMonths: 1,
  monthsActive: 0,
  startedAt: new Date().toISOString(),
  paymentMethod: null,
  lines: [{ id: 'l1', productId: 'p1', productTitle: 'Whey' }],
} as unknown as MemberSubscription

/** Every checkout now needs consent; these tests are about what happens after it. */
const consent = { accepted: true, termsVersion: TERMS_VERSION, disclaimerVersion: DISCLAIMER_VERSION }

describe('finalizeCheckout', () => {
  it('saves the bundle + quiz to the account and returns a mock payment URL', async () => {
    const user = await createUser({ email: 'buyer@example.com', passwordHash: 'h' })
    const payload: CheckoutPayload = {
      subscription,
      quiz: { answers: { name: 'Sam', goals: ['muscle'] } as unknown as QuizAnswers },
      consent,
    }

    const result = await finalizeCheckout(user.id, user.email, payload)
    expect(result.mock).toBe(true)
    expect(result.checkoutUrl).toBe('#mock-subscription')

    const stored = await getSubscription(user.id)
    expect(stored?.id).toBe('sub-x')
    // The account's real email is stamped onto the stored subscription.
    expect(stored?.customerEmail).toBe('buyer@example.com')

    const quiz = await getQuiz<{ answers: { name: string } }>(user.id)
    expect(quiz?.answers.name).toBe('Sam')
  })

  it('banks the revealed scratch discount onto the stored subscription', async () => {
    const user = await createUser({ email: 'lucky@example.com', passwordHash: 'h' })
    await finalizeCheckout(user.id, user.email, {
      subscription: { ...subscription, introDiscountRate: TOP },
      consent,
    })

    const stored = await getSubscription(user.id)
    expect(stored?.introDiscountRate).toBe(TOP)
    expect(stored?.firstMonth).toBe(Math.round(42 * (1 - TOP) * 100) / 100)
  })

  it('applies a partner code to the first month, and remembers whose it was', async () => {
    const partner = await createPartner({ email: 'code-sub@example.com', name: 'Sub Partner', discountPct: 0.2 })
    const user = await createUser({ email: 'referred@example.com', passwordHash: 'h' })

    await finalizeCheckout(user.id, user.email, {
      subscription,
      consent,
      partnerCode: partner.codes[0].code,
    })

    const stored = await getSubscription(user.id)
    // The code lives on the SUBSCRIPTION, not just the first order: renewals
    // earn commission too, and each one raises a fresh order months later.
    expect(stored?.partnerCode).toBe(partner.codes[0].code)
    expect(stored?.partnerDiscountPct).toBe(0.2)
    expect(stored?.firstMonth).toBe(33.6) // 42 less 20%
    // Month two onwards is untouched — a first-order code is not a standing rate.
    expect(stored?.flatMonthly).toBe(42)
  })

  it('carries the attribution onto every order the subscription raises', async () => {
    const partner = await createPartner({ email: 'renewals@example.com', name: 'Renewals Partner' })
    const user = await createUser({ email: 'renewer@example.com', passwordHash: 'h' })
    await finalizeCheckout(user.id, user.email, {
      subscription,
      consent,
      partnerCode: partner.codes[0].code,
    })

    const { listOrdersByPartnerCode } = await import('@/lib/orders/repo')
    const orders = await listOrdersByPartnerCode(partner.codes[0].code)
    expect(orders.length).toBeGreaterThan(0)
    expect(orders[0].partnerCode).toBe(partner.codes[0].code)
  })

  it('takes nothing off for a code that no longer works, rather than failing', async () => {
    // Someone mid-purchase should not be bounced out of a checkout because a
    // code went stale between the basket and the payment.
    const partner = await createPartner({ email: 'gone@example.com', name: 'Gone Partner' })
    await setPartnerStatus(partner.partner.id, 'suspended')

    const user = await createUser({ email: 'unlucky@example.com', passwordHash: 'h' })
    const result = await finalizeCheckout(user.id, user.email, {
      subscription,
      consent,
      partnerCode: partner.codes[0].code,
    })

    expect(result.mock).toBe(true)
    const stored = await getSubscription(user.id)
    expect(stored?.partnerCode).toBeNull()
    expect(stored?.firstMonth).toBe(42)
  })

  it('refuses a discount the client made up, without failing the checkout', async () => {
    const user = await createUser({ email: 'chancer@example.com', passwordHash: 'h' })
    const result = await finalizeCheckout(user.id, user.email, {
      subscription: { ...subscription, introDiscountRate: 0.9 },
      consent,
    })

    expect(result.checkoutUrl).toBe('#mock-subscription')
    const stored = await getSubscription(user.id)
    expect(stored?.introDiscountRate).toBe(0)
    expect(stored?.firstMonth).toBe(42) // billed in full
  })

  it('banks the claim against the allocation ledger', async () => {
    const before = ledgerTotals(await readIntroLedger())
    const user = await createUser({ email: 'ledger@example.com', passwordHash: 'h' })
    await finalizeCheckout(user.id, user.email, {
      subscription: { ...subscription, introDiscountRate: MID },
      consent,
    })

    const after = ledgerTotals(await readIntroLedger())
    expect(after.count).toBe(before.count + 1)
    expect(after.sum).toBeCloseTo(before.sum + MID, 10)
  })

  it('spends nothing from the ledger when no discount was claimed', async () => {
    const before = ledgerTotals(await readIntroLedger())
    const user = await createUser({ email: 'nodiscount@example.com', passwordHash: 'h' })
    await finalizeCheckout(user.id, user.email, { subscription, consent })

    expect(ledgerTotals(await readIntroLedger()).count).toBe(before.count)
  })
})

describe('consent is a precondition of checkout', () => {
  it('records what the member agreed to, against their account', async () => {
    const user = await createUser({ email: 'consented@example.com', passwordHash: 'h' })
    await finalizeCheckout(user.id, user.email, { subscription, consent }, {
      ip: '203.0.113.9',
      userAgent: 'jest',
    })

    const record = await latestConsent(user.id)
    expect(record).toMatchObject({ context: 'checkout', ip: '203.0.113.9', userAgent: 'jest' })
    expect(record!.documents.map((d) => d.id)).toEqual(['terms', 'disclaimer'])
    expect(record!.documents.every((d) => /^[0-9a-f]{64}$/.test(d.hash))).toBe(true)
  })

  it('refuses to store a plan or start a payment without consent', async () => {
    const user = await createUser({ email: 'unconsented@example.com', passwordHash: 'h' })

    await expect(finalizeCheckout(user.id, user.email, { subscription }))
      .rejects.toThrow(CheckoutRejected)

    // Nothing was written — no half-finished account with a plan and no consent.
    expect(await getSubscription(user.id)).toBeNull()
    expect(await latestConsent(user.id)).toBeNull()
  })

  it('refuses consent to a version we no longer serve', async () => {
    const user = await createUser({ email: 'stale@example.com', passwordHash: 'h' })

    await expect(
      finalizeCheckout(user.id, user.email, {
        subscription,
        consent: { ...consent, termsVersion: '2020-01-01' },
      }),
    ).rejects.toThrow(/updated/i)
    expect(await getSubscription(user.id)).toBeNull()
  })

  it('snapshots the member’s dietary exclusions onto the subscription', async () => {
    // Captured at the point of sale so a substitution months later is judged
    // against what they told us when they bought, not whatever their answers
    // happen to say by then.
    const user = await createUser({ email: 'vegan@example.com', passwordHash: 'h' })
    await finalizeCheckout(user.id, user.email, {
      subscription,
      quiz: { answers: { lifestyle: ['vegan'], stimPreference: 'no' } as unknown as QuizAnswers },
      consent,
    })

    const stored = await getSubscription(user.id)
    expect(stored?.safetyConstraints).toEqual({ dietaryTags: ['vegan'], noStimulants: true })
  })
})

describe('claimIntroDiscount', () => {
  const sub = { ...subscription, flatMonthly: 40 } as MemberSubscription

  it.each(CARDS)('honours the configured outcome %s', (rate) => {
    const claimed = claimIntroDiscount({ ...sub, introDiscountRate: rate })
    expect(claimed.introDiscountRate).toBe(rate)
    expect(claimed.firstMonth).toBe(Math.round(40 * (1 - rate) * 100) / 100)
  })

  it('claims nothing when no card was scratched', () => {
    const claimed = claimIntroDiscount(sub)
    expect(claimed.introDiscountRate).toBe(0)
    expect(claimed.firstMonth).toBe(40)
  })

  it('recomputes firstMonth from our own total, ignoring the one sent', () => {
    const claimed = claimIntroDiscount({ ...sub, introDiscountRate: MID, firstMonth: 1 })
    expect(claimed.firstMonth).toBe(Math.round(40 * (1 - MID) * 100) / 100)
  })

  it('leaves a per-product minimum term alone', () => {
    const claimed = claimIntroDiscount({ ...sub, minMonths: 6 })
    expect(claimed.minMonths).toBe(6)
  })
})
