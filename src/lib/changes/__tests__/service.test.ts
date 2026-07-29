/**
 * Detection → resolution, end to end against the in-memory database.
 *
 * The behaviour that matters most: an event always reaches an outcome. Nothing
 * here waits on a member, and a founder who never opens the hub delays a change
 * by the review window at most.
 */
import { applyDueChanges, runChangeDetection } from '@/lib/changes/service'
import { getChange } from '@/lib/changes/repo'
import { changeEventId } from '@/lib/changes/event'
import { listSnapshots } from '@/lib/changes/snapshots'
import type { FeedEntry } from '@/lib/changes/detect'
import { createUser } from '@/lib/db/users'
import { getSubscription, saveSubscription } from '@/lib/db/hub-data'
import { getPricingConfig, resetPricingOverrides, setPricingOverrides } from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct, DietaryTag } from '@/lib/catalogue/types'
import type { MemberSubscription } from '@/lib/recharge/types'
import { line, product, subscriptionWith } from './fixtures'

afterEach(() => resetPricingOverrides())

const NOW = new Date('2026-07-29T09:00:00.000Z')
const LATER = new Date('2026-07-31T09:00:00.000Z')

/** A catalogue product wired to a supplier SKU. */
function withSku(id: string, sku: string, over: Parameters<typeof product>[0] = { id }): CatalogueProduct {
  const p = product({ ...over, id })
  return { ...p, variants: [{ ...p.variants[0], sku }] }
}

const entry = (sku: string, over: Partial<FeedEntry> = {}): FeedEntry => ({
  sku, stock: 10, inStock: true, wholesalePrice: 10, rrp: 30, ...over,
})

/** A member holding `whey-a`, plus a second line so removal never empties the plan. */
async function seedMember(
  email: string,
  over: Partial<MemberSubscription> = {},
): Promise<{ userId: string; subscription: MemberSubscription }> {
  const user = await createUser({ email })
  const sub = subscriptionWith(
    [
      line({ id: 'l1', productId: 'whey-a', pricePerDelivery: 30 }),
      line({ id: 'l2', productId: 'other', pricePerDelivery: 30 }),
    ],
    over,
  )
  await saveSubscription(user.id, sub)
  return { userId: user.id, subscription: sub }
}

const CATALOGUE = [
  withSku('whey-a', 'SKU-A'),
  withSku('whey-b', 'SKU-B'),
  withSku('other', 'SKU-OTHER', { id: 'other', swapGroup: 'creatine' }),
]

/** Establish the baseline the next run diffs against. */
const BASELINE: FeedEntry[] = [entry('SKU-A'), entry('SKU-B'), entry('SKU-OTHER')]

function run(feed: FeedEntry[], subs: { userId: string; subscription: MemberSubscription }[], opts = {}) {
  return runChangeDetection({
    feed,
    previousSnapshots: BASELINE.map((e) => ({
      ...e, missedSyncs: 0, lastSeenAt: '2026-07-28T09:00:00.000Z', updatedAt: '2026-07-28T09:00:00.000Z',
    })),
    subscriptions: subs,
    catalogue: CATALOGUE,
    now: NOW,
    config: getPricingConfig(),
    ...opts,
  })
}

describe('the first run', () => {
  it('only establishes a baseline — it cannot detect a change against nothing', async () => {
    const member = await seedMember('baseline@example.com')
    const result = await runChangeDetection({
      feed: [entry('SKU-A', { inStock: false, stock: 0 })],
      previousSnapshots: [],
      subscriptions: [member],
      catalogue: CATALOGUE,
      now: NOW,
    })

    expect(result.baselineOnly).toBe(true)
    expect(result.events).toEqual([])
    expect((await listSnapshots()).some((s) => s.sku === 'SKU-A')).toBe(true)
  })
})

describe('a routine outage resolves itself', () => {
  it('swaps for a member who asked us to keep their plan whole', async () => {
    const member = await seedMember('swap@example.com', { defaultChangePolicy: 'auto-swap' })
    const result = await run([entry('SKU-A', { inStock: false, stock: 0 }), entry('SKU-B'), entry('SKU-OTHER')], [member])

    expect(result.events).toHaveLength(1)
    expect(result.events[0].intendedAction.resolution).toEqual({ type: 'substitute', replacementProductId: 'whey-b' })
    // No review needed for a routine outage on a healthy plan, so it lands now.
    expect(result.applied).toHaveLength(1)

    const stored = await getSubscription(member.userId)
    expect(stored!.lines.find((l) => l.id === 'l1')!.productId).toBe('whey-b')

    const event = await getChange(changeEventId(member.userId, 'l1', 'out-of-stock'))
    expect(event).toMatchObject({ status: 'applied', resolutionSource: 'system' })
    // Applied but not yet announced — the outbox sweep picks this up.
    expect(event!.notifiedAt).toBeNull()
  })

  it('removes and lowers the bill for a member who asked for that', async () => {
    const member = await seedMember('remove@example.com', { defaultChangePolicy: 'remove' })
    const result = await run([entry('SKU-A', { inStock: false, stock: 0 }), entry('SKU-B'), entry('SKU-OTHER')], [member])

    expect(result.events[0].intendedAction.resolution).toEqual({ type: 'remove' })

    const stored = await getSubscription(member.userId)
    expect(stored!.lines.map((l) => l.id)).toEqual(['l2'])
    expect(stored!.flatMonthly).toBe(30)
    expect(stored!.billingHistory).toHaveLength(1)
  })
})

describe('the safety fallback', () => {
  it('removes rather than swapping when nothing safe exists, even for auto-swap', async () => {
    // A vegan member whose protein goes out of stock, with only a non-vegan
    // alternative in the category. Sending it would be worse than shrinking
    // their plan — removal is always available, which is what makes this safe.
    const member = await seedMember('vegan@example.com', {
      defaultChangePolicy: 'auto-swap',
      safetyConstraints: { dietaryTags: ['vegan' as DietaryTag], noStimulants: false },
    })

    const result = await run([entry('SKU-A', { inStock: false, stock: 0 }), entry('SKU-B'), entry('SKU-OTHER')], [member])

    expect(result.events[0].intendedAction.resolution).toEqual({ type: 'remove' })
    expect(result.events[0].intendedAction.reason).toBe('no-safe-replacement')

    // Losing a line because nothing suits them is a bigger deal than a clean
    // swap, so it waits for a founder — but only until the window elapses.
    expect(result.events[0].status).toBe('requires-action')
    expect((await getSubscription(member.userId))!.lines).toHaveLength(2)

    await applyDueChanges({ now: LATER, config: getPricingConfig(), catalogue: CATALOGUE })
    expect((await getSubscription(member.userId))!.lines.map((l) => l.id)).toEqual(['l2'])
  })

  it('says "nothing available" rather than "nothing safe" when the category is empty', async () => {
    const member = await seedMember('empty@example.com', { defaultChangePolicy: 'auto-swap' })
    // whey-b out too, so there is genuinely nothing to swap to.
    const result = await run(
      [entry('SKU-A', { inStock: false, stock: 0 }), entry('SKU-B', { inStock: false, stock: 0 }), entry('SKU-OTHER')],
      [member],
    )

    const forLine1 = result.events.find((e) => e.lineId === 'l1')!
    expect(forLine1.intendedAction.reason).toBe('no-replacement-available')
  })
})

describe('the founder review window', () => {
  it('holds a discontinuation with a deadline instead of applying it blind', async () => {
    setPricingOverrides({ founderReviewHours: 24, discontinuedAfterMissedSyncs: 1 })
    const member = await seedMember('disc@example.com', { defaultChangePolicy: 'auto-swap' })

    // SKU-A absent from the feed entirely.
    const result = await run([entry('SKU-B'), entry('SKU-OTHER')], [member], { config: getPricingConfig() })

    expect(result.events[0].kind).toBe('discontinued')
    expect(result.events[0].status).toBe('requires-action')
    expect(result.applied).toHaveLength(0)

    // Nothing has touched the plan yet.
    expect((await getSubscription(member.userId))!.lines).toHaveLength(2)
  })

  it('applies it anyway once the window elapses — a quiet queue never stalls a plan', async () => {
    setPricingOverrides({ founderReviewHours: 24, discontinuedAfterMissedSyncs: 1 })
    const member = await seedMember('disc2@example.com', { defaultChangePolicy: 'auto-swap' })
    await run([entry('SKU-B'), entry('SKU-OTHER')], [member], { config: getPricingConfig() })

    // The sweep is global by nature, so assert on this member's slice of it —
    // the file shares one in-memory database across tests.
    const applied = await applyDueChanges({ now: LATER, config: getPricingConfig(), catalogue: CATALOGUE })
    expect(applied.filter((e) => e.userId === member.userId)).toHaveLength(1)

    expect((await getSubscription(member.userId))!.lines.find((l) => l.id === 'l1')!.productId).toBe('whey-b')
  })
})

describe('re-running detection', () => {
  it('refreshes an open event without duplicating it or restarting its deadline', async () => {
    setPricingOverrides({ founderReviewHours: 24, discontinuedAfterMissedSyncs: 1 })
    const member = await seedMember('rerun@example.com', { defaultChangePolicy: 'auto-swap' })

    const first = await run([entry('SKU-B'), entry('SKU-OTHER')], [member], { config: getPricingConfig() })
    const deadline = first.events[0].autoApplyAt

    const second = await runChangeDetection({
      feed: [entry('SKU-B'), entry('SKU-OTHER')],
      previousSnapshots: BASELINE.map((e) => ({
        ...e, missedSyncs: 0, lastSeenAt: '2026-07-28T09:00:00.000Z', updatedAt: '2026-07-28T09:00:00.000Z',
      })),
      subscriptions: [member],
      catalogue: CATALOGUE,
      now: new Date('2026-07-29T15:00:00.000Z'),
      config: getPricingConfig(),
    })

    // Same event, same clock — confirming the product is still gone must not buy
    // the founder another day.
    expect(second.events).toHaveLength(1)
    expect(second.events[0].id).toBe(first.events[0].id)
    expect(second.events[0].autoApplyAt).toBe(deadline)
  })

  it('leaves a resolved event alone rather than re-raising it', async () => {
    const member = await seedMember('resolved@example.com', { defaultChangePolicy: 'remove' })
    const oos = [entry('SKU-A', { inStock: false, stock: 0 }), entry('SKU-B'), entry('SKU-OTHER')]

    await run(oos, [member]) // applies the removal
    const before = await getChange(changeEventId(member.userId, 'l1', 'out-of-stock'))

    const second = await run(oos, [{ userId: member.userId, subscription: (await getSubscription(member.userId))! }])

    expect(second.events).toHaveLength(0)
    expect((await getChange(before!.id))!.status).toBe('applied')
  })
})

describe('the supplier fixing it for us', () => {
  it('cancels an open event when the product comes back in stock', async () => {
    setPricingOverrides({ founderReviewHours: 24, discontinuedAfterMissedSyncs: 1 })
    const member = await seedMember('recovered@example.com', {
      defaultChangePolicy: 'auto-swap',
      // No safe replacement → the intended action is removal, which needs review,
      // so the event is still open when the supplier restocks.
      safetyConstraints: { dietaryTags: ['vegan' as DietaryTag], noStimulants: false },
    })

    await run([entry('SKU-A', { inStock: false, stock: 0 }), entry('SKU-B'), entry('SKU-OTHER')], [member], {
      config: getPricingConfig(),
    })
    const raised = await getChange(changeEventId(member.userId, 'l1', 'out-of-stock'))
    expect(raised!.status).toBe('requires-action')

    // Next run: back in stock.
    const recovery = await runChangeDetection({
      feed: [entry('SKU-A'), entry('SKU-B'), entry('SKU-OTHER')],
      previousSnapshots: [
        { ...entry('SKU-A', { inStock: false, stock: 0 }), missedSyncs: 0, lastSeenAt: '2026-07-29T09:00:00.000Z', updatedAt: '2026-07-29T09:00:00.000Z' },
      ],
      subscriptions: [member],
      catalogue: CATALOGUE,
      now: LATER,
      config: getPricingConfig(),
    })

    expect(recovery.recoveredSkus).toEqual(['SKU-A'])
    expect(recovery.cancelled.map((e) => e.id)).toContain(raised!.id)
    expect((await getChange(raised!.id))!.status).toBe('cancelled')
    // The member's plan was never touched.
    expect((await getSubscription(member.userId))!.lines).toHaveLength(2)
  })
})

describe('dry run', () => {
  it('reports what would happen and writes nothing', async () => {
    const member = await seedMember('dry@example.com', { defaultChangePolicy: 'remove' })
    const result = await run(
      [entry('SKU-A', { inStock: false, stock: 0 }), entry('SKU-B'), entry('SKU-OTHER')],
      [member],
      { dryRun: true },
    )

    expect(result.dryRun).toBe(true)
    expect(result.events).toHaveLength(1)
    expect(result.applied).toEqual([])
    expect(await getChange(changeEventId(member.userId, 'l1', 'out-of-stock'))).toBeNull()
    expect((await getSubscription(member.userId))!.lines).toHaveLength(2)
  })
})
