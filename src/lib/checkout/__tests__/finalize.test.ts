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
      lines: [],
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
      subscription: { ...subscription, introDiscountRate: 0.5 },
      lines: [],
      consent,
    })

    const stored = await getSubscription(user.id)
    expect(stored?.introDiscountRate).toBe(0.5)
    expect(stored?.firstMonth).toBe(21) // 42 × 0.5
  })

  it('refuses a discount the client made up, without failing the checkout', async () => {
    const user = await createUser({ email: 'chancer@example.com', passwordHash: 'h' })
    const result = await finalizeCheckout(user.id, user.email, {
      subscription: { ...subscription, introDiscountRate: 0.9 },
      lines: [],
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
      subscription: { ...subscription, introDiscountRate: 0.25 },
      lines: [],
      consent,
    })

    const after = ledgerTotals(await readIntroLedger())
    expect(after.count).toBe(before.count + 1)
    expect(after.sum).toBeCloseTo(before.sum + 0.25, 10)
  })

  it('spends nothing from the ledger when no discount was claimed', async () => {
    const before = ledgerTotals(await readIntroLedger())
    const user = await createUser({ email: 'nodiscount@example.com', passwordHash: 'h' })
    await finalizeCheckout(user.id, user.email, { subscription, lines: [], consent })

    expect(ledgerTotals(await readIntroLedger()).count).toBe(before.count)
  })
})

describe('consent is a precondition of checkout', () => {
  it('records what the member agreed to, against their account', async () => {
    const user = await createUser({ email: 'consented@example.com', passwordHash: 'h' })
    await finalizeCheckout(user.id, user.email, { subscription, lines: [], consent }, {
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

    await expect(finalizeCheckout(user.id, user.email, { subscription, lines: [] }))
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
        lines: [],
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
      lines: [],
      consent,
    })

    const stored = await getSubscription(user.id)
    expect(stored?.safetyConstraints).toEqual({ dietaryTags: ['vegan'], noStimulants: true })
  })
})

describe('claimIntroDiscount', () => {
  const sub = { ...subscription, flatMonthly: 40 } as MemberSubscription

  it.each([0.5, 0.25, 0.1])('honours the configured outcome %s', (rate) => {
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
    const claimed = claimIntroDiscount({ ...sub, introDiscountRate: 0.25, firstMonth: 1 })
    expect(claimed.firstMonth).toBe(30)
  })

  it('leaves a per-product minimum term alone', () => {
    const claimed = claimIntroDiscount({ ...sub, minMonths: 6 })
    expect(claimed.minMonths).toBe(6)
  })
})
