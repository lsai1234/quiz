/**
 * Founder resolution and the queue's ordering.
 *
 * The point of a founder override is that it goes through exactly the same
 * machinery as the automatic path — same billing maths, same audit trail, same
 * email — differing only in who decided.
 */
import { bulkResolveByProduct, resolveChangeEvent, runChangeDetection } from '@/lib/changes/service'
import { getChange } from '@/lib/changes/repo'
import { changeEventId } from '@/lib/changes/event'
import { countdownTo, healthFor, sortByUrgency, summarise } from '@/lib/changes/health'
import { listNotifications } from '@/lib/notify/outbox'
import type { FeedEntry } from '@/lib/changes/detect'
import type { ChangeEvent } from '@/lib/changes/types'
import { createUser } from '@/lib/db/users'
import { getSubscription, saveSubscription } from '@/lib/db/hub-data'
import { getPricingConfig, resetPricingOverrides, setPricingOverrides } from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscription } from '@/lib/recharge/types'
import { line, product, subscriptionWith } from './fixtures'

afterEach(() => resetPricingOverrides())

const NOW = new Date('2026-07-29T09:00:00.000Z')

function withSku(id: string, sku: string, over: Parameters<typeof product>[0] = { id }): CatalogueProduct {
  const p = product({ ...over, id })
  return { ...p, variants: [{ ...p.variants[0], sku }] }
}

const entry = (sku: string, over: Partial<FeedEntry> = {}): FeedEntry => ({
  sku, stock: 10, inStock: true, wholesalePrice: 10, rrp: 30, ...over,
})

const CATALOGUE = [
  withSku('whey-a', 'SKU-A'),
  withSku('whey-b', 'SKU-B', { id: 'whey-b', title: 'Impact Whey' }),
  withSku('whey-c', 'SKU-C', { id: 'whey-c', title: 'Clear Whey' }),
  withSku('other', 'SKU-OTHER', { id: 'other', swapGroup: 'creatine' }),
]

const BASELINE = [entry('SKU-A'), entry('SKU-B'), entry('SKU-C'), entry('SKU-OTHER')].map((e) => ({
  ...e, missedSyncs: 0, lastSeenAt: '2026-07-28T09:00:00.000Z', updatedAt: '2026-07-28T09:00:00.000Z',
}))

const OUTAGE = [entry('SKU-A', { inStock: false, stock: 0 }), entry('SKU-B'), entry('SKU-C'), entry('SKU-OTHER')]

async function seedMember(email: string, over: Partial<MemberSubscription> = {}) {
  const user = await createUser({ email })
  const sub = subscriptionWith(
    [line({ id: 'l1', productId: 'whey-a', pricePerDelivery: 30 }),
     line({ id: 'l2', productId: 'other', pricePerDelivery: 30 })],
    { customerEmail: email, ...over },
  )
  await saveSubscription(user.id, sub)
  return { userId: user.id, subscription: sub }
}

const run = (subs: { userId: string; subscription: MemberSubscription }[]) =>
  runChangeDetection({
    feed: OUTAGE, previousSnapshots: BASELINE, subscriptions: subs,
    catalogue: CATALOGUE, now: NOW, config: getPricingConfig(),
  })

/** Discontinued-style review so events sit open long enough to resolve by hand. */
function heldForReview() {
  setPricingOverrides({ founderReviewHours: 24 })
}

/**
 * These fixtures carry two £30 lines, so removing one leaves a £30 plan. That is
 * under the live `minSubscriptionMonthly`, which would make removal "break the
 * plan" and route it to review — a different path from the one under test here.
 * Pinning the minimum keeps these tests about the REMOVE flow rather than about
 * the subscription floor, which has its own tests in lib/pricing/thresholds.
 */
const ALLOW_REMOVAL = () => setPricingOverrides({ minSubscriptionMonthly: 20 })

describe('a founder overriding the system', () => {
  beforeEach(ALLOW_REMOVAL)

  it('can swap to something other than the suggestion', async () => {
    heldForReview()
    const member = await seedMember('override@example.com', {
      defaultChangePolicy: 'auto-swap',
      safetyConstraints: { dietaryTags: ['vegan'], noStimulants: false }, // no safe suggestion → held
    })
    await run([member])

    const id = changeEventId(member.userId, 'l1', 'out-of-stock')
    const resolved = await resolveChangeEvent(id, { type: 'substitute', replacementProductId: 'whey-c' }, {
      catalogue: CATALOGUE, config: getPricingConfig(),
    })

    expect(resolved).toMatchObject({ status: 'applied', resolutionSource: 'founder' })
    expect((await getSubscription(member.userId))!.lines.find((l) => l.id === 'l1')!.productId).toBe('whey-c')
  })

  it('holds a line by skipping its next box, leaving the price alone', async () => {
    heldForReview()
    const member = await seedMember('hold@example.com', {
      defaultChangePolicy: 'auto-swap',
      safetyConstraints: { dietaryTags: ['vegan'], noStimulants: false },
    })
    await run([member])

    const id = changeEventId(member.userId, 'l1', 'out-of-stock')
    await resolveChangeEvent(id, { type: 'hold' }, { catalogue: CATALOGUE, config: getPricingConfig() })

    const stored = await getSubscription(member.userId)!
    expect(stored!.lines).toHaveLength(2) // still there
    expect(stored!.flatMonthly).toBe(60)
    expect(stored!.lines.find((l) => l.id === 'l1')!.pendingCredit).toBe(30)
  })

  it('closes a dismissal as cancelled — nothing happened, so nothing was applied', async () => {
    heldForReview()
    const member = await seedMember('dismiss@example.com', {
      defaultChangePolicy: 'auto-swap',
      safetyConstraints: { dietaryTags: ['vegan'], noStimulants: false },
    })
    await run([member])

    const id = changeEventId(member.userId, 'l1', 'out-of-stock')
    const resolved = await resolveChangeEvent(id, { type: 'dismiss' })

    expect(resolved!.status).toBe('cancelled')
    expect((await getSubscription(member.userId))!.lines).toHaveLength(2)
  })

  it('refuses to redo an event that has already settled', async () => {
    const member = await seedMember('settled@example.com', { defaultChangePolicy: 'remove' })
    await run([member]) // auto-applies the removal

    const id = changeEventId(member.userId, 'l1', 'out-of-stock')
    const again = await resolveChangeEvent(id, { type: 'substitute', replacementProductId: 'whey-b' }, {
      catalogue: CATALOGUE,
    })

    expect(again!.status).toBe('applied')
    expect(again!.resolution).toEqual({ type: 'remove' }) // unchanged
  })

  it('emails the member, exactly as the automatic path would', async () => {
    heldForReview()
    const member = await seedMember('founder-email@example.com', {
      defaultChangePolicy: 'auto-swap',
      safetyConstraints: { dietaryTags: ['vegan'], noStimulants: false },
    })
    await run([member])

    const id = changeEventId(member.userId, 'l1', 'out-of-stock')
    await resolveChangeEvent(id, { type: 'substitute', replacementProductId: 'whey-c' }, {
      catalogue: CATALOGUE, config: getPricingConfig(),
    })
    const { flushChangeNotifications } = await import('@/lib/changes/service')
    await flushChangeNotifications()

    const sent = await listNotifications({ userId: member.userId })
    expect(sent[0].rendered.text).toContain('Clear Whey')
  })
})

describe('bulk resolve', () => {
  it('settles one dead product across every member holding it', async () => {
    heldForReview()
    const constraints = { dietaryTags: ['vegan' as const], noStimulants: false }
    const a = await seedMember('bulk-a@example.com', { defaultChangePolicy: 'auto-swap', safetyConstraints: constraints })
    const b = await seedMember('bulk-b@example.com', { defaultChangePolicy: 'auto-swap', safetyConstraints: constraints })
    await run([a, b])

    const result = await bulkResolveByProduct('whey-a', { type: 'substitute', replacementProductId: 'whey-b' }, {
      catalogue: CATALOGUE, config: getPricingConfig(),
    })

    expect(result.resolved).toHaveLength(2)
    for (const member of [a, b]) {
      expect((await getSubscription(member.userId))!.lines.find((l) => l.id === 'l1')!.productId).toBe('whey-b')
    }
  })

  it('never swaps for a member who asked to have things removed', async () => {
    // Bulk saves the founder clicks; it must not override an individual's choice.
    heldForReview()
    const swapper = await seedMember('bulk-swap@example.com', {
      defaultChangePolicy: 'auto-swap',
      safetyConstraints: { dietaryTags: ['vegan'], noStimulants: false },
    })
    const remover = await seedMember('bulk-remove@example.com', { defaultChangePolicy: 'remove' })
    await run([swapper, remover])

    await bulkResolveByProduct('whey-a', { type: 'substitute', replacementProductId: 'whey-b' }, {
      catalogue: CATALOGUE, config: getPricingConfig(),
    })

    expect((await getSubscription(swapper.userId))!.lines.find((l) => l.id === 'l1')!.productId).toBe('whey-b')
    // The remover's line is gone, not swapped.
    expect((await getSubscription(remover.userId))!.lines.map((l) => l.id)).toEqual(['l2'])
  })

  it('leaves other products alone', async () => {
    heldForReview()
    const member = await seedMember('bulk-scope@example.com', {
      defaultChangePolicy: 'auto-swap',
      safetyConstraints: { dietaryTags: ['vegan'], noStimulants: false },
    })
    await run([member])

    const result = await bulkResolveByProduct('some-other-product', { type: 'remove' }, { catalogue: CATALOGUE })
    expect(result.resolved).toHaveLength(0)
    expect((await getChange(changeEventId(member.userId, 'l1', 'out-of-stock')))!.status).toBe('requires-action')
  })
})

describe('the subscriptions list', () => {
  const event = (over: Partial<ChangeEvent>): ChangeEvent =>
    ({ status: 'requires-action', autoApplyAt: '2026-07-30T09:00:00.000Z', ...over }) as ChangeEvent

  it('reads health off the open events', () => {
    expect(healthFor([])).toBe('healthy')
    expect(healthFor([event({ status: 'auto-resolved' })])).toBe('healthy')
    expect(healthFor([event({ status: 'scheduled' })])).toBe('scheduled')
    expect(healthFor([event({ status: 'requires-action' })])).toBe('requires-action')
  })

  it('summarises a member with their soonest deadline', () => {
    const sub = subscriptionWith([line({ id: 'l1', changePolicy: 'remove' }), line({ id: 'l2', productId: 'p2' })], {
      customerEmail: 'sam@example.com',
      defaultChangePolicy: 'auto-swap',
    })
    const summary = summarise('u1', sub, [
      event({ autoApplyAt: '2026-07-31T09:00:00.000Z' }),
      event({ autoApplyAt: '2026-07-30T09:00:00.000Z' }),
    ])

    expect(summary).toMatchObject({
      email: 'sam@example.com',
      health: 'requires-action',
      openCount: 2,
      nextAutoApplyAt: '2026-07-30T09:00:00.000Z',
      defaultChangePolicy: 'auto-swap',
      overriddenLines: 1,
    })
  })

  it('puts whoever needs attention soonest at the top', () => {
    const summaries = [
      { email: 'c', health: 'healthy', nextAutoApplyAt: null },
      { email: 'a', health: 'requires-action', nextAutoApplyAt: '2026-07-31T09:00:00.000Z' },
      { email: 'b', health: 'requires-action', nextAutoApplyAt: '2026-07-30T09:00:00.000Z' },
      { email: 'd', health: 'scheduled', nextAutoApplyAt: null },
    ] as Parameters<typeof sortByUrgency>[0]

    expect(sortByUrgency(summaries).map((s) => s.email)).toEqual(['b', 'a', 'd', 'c'])
  })
})

describe('the countdown', () => {
  const now = new Date('2026-07-29T09:00:00.000Z')

  it('reads in whatever unit is useful', () => {
    expect(countdownTo('2026-07-31T09:00:00.000Z', now)).toBe('in 2d')
    expect(countdownTo('2026-07-29T14:00:00.000Z', now)).toBe('in 5h')
    expect(countdownTo('2026-07-29T09:30:00.000Z', now)).toBe('in 30m')
  })

  it('says so when the window has already passed', () => {
    expect(countdownTo('2026-07-29T08:00:00.000Z', now)).toBe('any moment')
  })

  it('copes with nothing to count down to', () => {
    expect(countdownTo(null, now)).toBeNull()
    expect(countdownTo('not-a-date', now)).toBeNull()
  })
})
