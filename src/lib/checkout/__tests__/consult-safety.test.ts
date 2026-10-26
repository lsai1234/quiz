/**
 * A consult's exclusions reach the order, and outlive the results page.
 *
 * Someone on blood thinners finishes the consult. Vitamin K is kept out of their
 * stack, and it has to stay out months later: when their vitamin D sells out,
 * the swap that keeps their plan whole must never be a D3 + K2. These tests walk
 * that from the consult's own answers, through checkout, into the daily change
 * job and the order page's swap — and check the same journey without the
 * exclusions DOES pick the K2, so the test can't pass by accident.
 */
import { finalizeCheckout } from '../finalize'
import { createUser } from '@/lib/db/users'
import { getSubscription, saveSubscription } from '@/lib/db/hub-data'
import { listConsents } from '@/lib/legal/consent'
import { HEALTH_DATA_VERSION } from '@/lib/legal/content'
import { runChangeDetection } from '@/lib/changes/service'
import { sanitiseHealthData } from '@/lib/legal/health-data'
import { getPricingConfig, resetPricingOverrides, setPricingOverrides } from '@/lib/stack-blueprint/pricing'
import { runStackEngine } from '@/lib/consult/engine'
import { toQuizAnswers } from '@/lib/consult/adapter'
import { PERSONAS } from '@/lib/consult/personas'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { createOrderFromCheckout } from '@/lib/orders/service'
import { replacementCandidates, searchReplacements, swapLine } from '@/lib/orders/line-changes'
import { line, product, subscriptionWith } from '@/lib/changes/__tests__/fixtures'
import { TERMS_VERSION, DISCLAIMER_VERSION } from '@/lib/legal/content'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { FeedEntry } from '@/lib/changes/detect'
import type { SupplierProvider } from '@/lib/supplier/types'

jest.mock('@/lib/payments/stripe', () => ({ createSubscriptionSession: jest.fn(), refundPaymentAmount: jest.fn() }))

const consent = { accepted: true, termsVersion: TERMS_VERSION, disclaimerVersion: DISCLAIMER_VERSION }

/** Two vitamin Ds, the second with K2 in it — the swap that must never happen. */
function vitaminD(id: string, sku: string, title: string): CatalogueProduct {
  const p = product({ id, swapGroup: 'vitamin-d', price: 12, title })
  return { ...p, category: 'Health', variants: [{ ...p.variants[0], sku }] }
}
const PLAIN_D = vitaminD('vit-d', 'SKU-D', 'Vitamin D3 4000IU')
const D_K2 = vitaminD('vit-d-k2', 'SKU-DK2', 'Vitamin D3 + K2')
const OTHER = (() => {
  const p = product({ id: 'other', swapGroup: 'creatine', price: 30 })
  return { ...p, variants: [{ ...p.variants[0], sku: 'SKU-OTHER' }] }
})()
const CATALOGUE = [PLAIN_D, D_K2, OTHER]

const entry = (sku: string, over: Partial<FeedEntry> = {}): FeedEntry => ({
  sku, stock: 10, inStock: true, wholesalePrice: 5, rrp: 15, ...over,
})
const BASELINE = [entry('SKU-D'), entry('SKU-DK2'), entry('SKU-OTHER')]
const NOW = new Date('2026-11-02T09:00:00.000Z')

function soldOut(subscriptions: NonNullable<Parameters<typeof runChangeDetection>[0]>['subscriptions']) {
  return runChangeDetection({
    feed: [entry('SKU-D', { inStock: false, stock: 0 }), entry('SKU-DK2'), entry('SKU-OTHER')],
    previousSnapshots: BASELINE.map((e) => ({ ...e, missedSyncs: 0, lastSeenAt: '2026-11-01T09:00:00.000Z', updatedAt: '2026-11-01T09:00:00.000Z' })),
    subscriptions,
    catalogue: CATALOGUE,
    now: NOW,
    config: getPricingConfig(),
  })
}

/** The blood-thinner persona (p06), as the consult hands it to the results page. */
function bloodThinnerAnswers() {
  const persona = PERSONAS.find((p) => p.id === 'p06')!
  // The personas tick a stand-in consent; this is the one the circuit check records.
  const answers = { ...persona.answers, healthConsent: { accepted: true as const, version: HEALTH_DATA_VERSION, at: '2026-10-30T10:15:00.000Z' } }
  const engine = runStackEngine(answers, MOCK_CATALOGUE)
  return toQuizAnswers(answers, engine.excludedIngredients)
}

const plan = () =>
  subscriptionWith(
    [
      line({ id: 'l1', productId: 'vit-d', productTitle: 'Vitamin D3 4000IU', swapGroup: 'vitamin-d', pricePerDelivery: 12 }),
      line({ id: 'l2', productId: 'other', swapGroup: 'creatine', pricePerDelivery: 30 }),
    ],
    { defaultChangePolicy: 'auto-swap' },
  )

beforeEach(() => setPricingOverrides({ minSubscriptionMonthly: 20 }))
afterEach(() => resetPricingOverrides())

describe('a blood-thinner consult, from checkout to a sell-out', () => {
  it('carries the exclusions and the circuit check’s consent onto the answers', () => {
    const answers = bloodThinnerAnswers()
    expect(answers.consultExcluded).toEqual(expect.arrayContaining(['vitamin-k', 'fish-oil', 'rx-interaction']))
    expect(answers.healthDataConsent).toMatchObject({ accepted: true, version: HEALTH_DATA_VERSION })
    // Still none of the circuit check's own answers.
    expect(answers.safetyFlags).toEqual([])
  })

  it('stores them on the subscription, and never swaps in a vitamin K product', async () => {
    const user = await createUser({ email: 'thinners@example.com', passwordHash: 'h' })
    await finalizeCheckout(user.id, user.email, { subscription: plan(), quiz: { answers: bloodThinnerAnswers() }, consent })

    const stored = await getSubscription(user.id)
    expect(stored!.safetyConstraints!.excludedIngredients).toEqual(expect.arrayContaining(['vitamin-k']))

    const result = await soldOut([{ userId: user.id, subscription: stored! }])
    const forD = result.events.find((e) => e.lineId === 'l1')!
    expect(forD.intendedAction.resolution).toEqual({ type: 'remove' })
    expect(forD.intendedAction.reason).toBe('no-safe-replacement')
  })

  it('writes the health-data consent record, with the circuit check’s version and time', async () => {
    const user = await createUser({ email: 'consent@example.com', passwordHash: 'h' })
    const answers = bloodThinnerAnswers()
    await finalizeCheckout(user.id, user.email, { subscription: plan(), quiz: { answers }, consent })

    const health = (await listConsents(user.id)).filter((c) => c.context === 'health-data')
    expect(health).toHaveLength(1)
    expect(health[0].acceptedAt).toBe(answers.healthDataConsent!.at)
    expect(health[0].documents[0].version).toBe(HEALTH_DATA_VERSION)
  })

  it('without the exclusions the same sell-out does pick the K2 — the control', async () => {
    const user = await createUser({ email: 'control@example.com', passwordHash: 'h' })
    const subscription = { ...plan(), safetyConstraints: { dietaryTags: [], noStimulants: false, safetyFlags: [] } }
    await saveSubscription(user.id, subscription)
    const result = await soldOut([{ userId: user.id, subscription }])
    expect(result.events.find((e) => e.lineId === 'l1')!.intendedAction.resolution).toEqual({
      type: 'substitute',
      replacementProductId: 'vit-d-k2',
    })
  })

  it('drops the exclusions without a current consent, as it does the safety flags', () => {
    const { healthDataConsent: _gone, ...answers } = bloodThinnerAnswers()
    expect(sanitiseHealthData(answers).consultExcluded).toBeUndefined()
  })
})

describe('a one-off order from the same consult', () => {
  const supplier: SupplierProvider = {
    name: 'powerbody',
    probeProductIds: async (ids: string[]) => ids.map((id) => ({ productId: id, sku: id, name: id, wholesalePrice: 4, stock: 25, inStock: true })),
    getProductsById: async () => [],
    getProductsBySku: async () => [],
  } as unknown as SupplierProvider

  async function order() {
    const answers = bloodThinnerAnswers()
    return createOrderFromCheckout({
      channel: 'quiz',
      lines: [{ sku: 'SKU-D', productId: 'vit-d', title: 'Vitamin D3 4000IU', variantTitle: null, quantity: 1, unitPrice: 12, supplierCost: 5, weightGrams: null }],
      status: 'paid',
      safetyConstraints: { dietaryTags: [], noStimulants: false, safetyFlags: [], excludedIngredients: answers.consultExcluded },
      healthDataConsent: answers.healthDataConsent,
    })
  }

  it('keeps the exclusions on the order, with the consent they came under', async () => {
    const o = await order()
    expect(o.safetyConstraints!.excludedIngredients).toContain('vitamin-k')
    expect(o.healthDataConsent).toMatchObject({ accepted: true, version: HEALTH_DATA_VERSION })
  })

  it('never offers the K2 as a replacement, and refuses it even when a founder picks it', async () => {
    const o = await order()
    expect(replacementCandidates(o, o.lines[0], CATALOGUE).map((c) => c.productId)).not.toContain('vit-d-k2')

    const picked = await searchReplacements(o.id, 0, 'K2', { catalogue: CATALOGUE, supplier })
    expect(picked[0].warnings.join(' ')).toMatch(/safety grounds/)

    await expect(
      swapLine(o.id, 0, 'SKU-D', { productId: 'vit-d-k2', variantId: D_K2.variants[0].id }, { acceptWarnings: true, notify: false }, { catalogue: CATALOGUE, supplier }),
    ).rejects.toThrow(/kept it out on safety grounds/)
  })

  it('an order without the snapshot still offers the K2 — the control', async () => {
    const o = await createOrderFromCheckout({
      channel: 'quiz',
      lines: [{ sku: 'SKU-D', productId: 'vit-d', title: 'Vitamin D3 4000IU', variantTitle: null, quantity: 1, unitPrice: 12, supplierCost: 5, weightGrams: null }],
      status: 'paid',
    })
    expect(replacementCandidates(o, o.lines[0], CATALOGUE).map((c) => c.productId)).toContain('vit-d-k2')
  })

  it('drops a snapshot that arrives without its consent', async () => {
    const o = await createOrderFromCheckout({
      channel: 'quiz',
      lines: [{ sku: 'SKU-D', productId: 'vit-d', title: 'Vitamin D3 4000IU', variantTitle: null, quantity: 1, unitPrice: 12, supplierCost: 5, weightGrams: null }],
      status: 'paid',
      safetyConstraints: { dietaryTags: [], noStimulants: false, excludedIngredients: ['vitamin-k'] },
    })
    expect(o.safetyConstraints).toBeUndefined()
  })
})
