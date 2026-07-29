/**
 * Detection → applied change → the email the member actually gets.
 *
 * The point of these: a change that alters someone's plan must produce a
 * message, and one that alters nothing must not. Emailing people about
 * non-events is how they learn to ignore the emails that matter.
 */
import { runChangeDetection } from '@/lib/changes/service'
import { getChange } from '@/lib/changes/repo'
import { changeEventId } from '@/lib/changes/event'
import { notificationForEvent, hubLinks } from '@/lib/notify/from-change'
import { getByDedupeKey, dedupeKeyFor, listNotifications } from '@/lib/notify/outbox'
import type { FeedEntry } from '@/lib/changes/detect'
import { createUser } from '@/lib/db/users'
import { getSubscription, saveSubscription } from '@/lib/db/hub-data'
import { getPricingConfig, resetPricingOverrides } from '@/lib/stack-blueprint/pricing'
import { ALLERGEN_CHECK_SENTENCE } from '@/lib/legal/content'
import type { CatalogueProduct, DietaryTag } from '@/lib/catalogue/types'
import type { MemberSubscription } from '@/lib/recharge/types'
import type { ChangeEvent } from '@/lib/changes/types'
import { line, product, subscriptionWith } from '@/lib/changes/__tests__/fixtures'

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
  withSku('whey-b', 'SKU-B', { id: 'whey-b', title: 'Impact Whey Isolate' }),
  withSku('other', 'SKU-OTHER', { id: 'other', swapGroup: 'creatine' }),
]

const BASELINE = [entry('SKU-A'), entry('SKU-B'), entry('SKU-OTHER')].map((e) => ({
  ...e, missedSyncs: 0, lastSeenAt: '2026-07-28T09:00:00.000Z', updatedAt: '2026-07-28T09:00:00.000Z',
}))

async function seedMember(email: string, over: Partial<MemberSubscription> = {}) {
  const user = await createUser({ email })
  const sub = subscriptionWith(
    [line({ id: 'l1', productId: 'whey-a', productTitle: 'Gold Standard Whey', pricePerDelivery: 30 }),
     line({ id: 'l2', productId: 'other', pricePerDelivery: 30 })],
    { customerEmail: email, ...over },
  )
  await saveSubscription(user.id, sub)
  return { userId: user.id, subscription: sub }
}

const OUTAGE = [entry('SKU-A', { inStock: false, stock: 0 }), entry('SKU-B'), entry('SKU-OTHER')]

const run = (feed: FeedEntry[], subs: { userId: string; subscription: MemberSubscription }[]) =>
  runChangeDetection({
    feed,
    previousSnapshots: BASELINE,
    subscriptions: subs,
    catalogue: CATALOGUE,
    now: NOW,
    config: getPricingConfig(),
  })

describe('a swap reaches the member', () => {
  it('sends a substitution email naming both products, with the allergen line', async () => {
    const member = await seedMember('swap-notify@example.com', { defaultChangePolicy: 'auto-swap' })
    const result = await run(OUTAGE, [member])

    expect(result.notified).toBeGreaterThan(0)

    const id = changeEventId(member.userId, 'l1', 'out-of-stock')
    const sent = await getByDedupeKey(dedupeKeyFor(id, 'product-substituted'))

    expect(sent).toMatchObject({ status: 'sent', email: 'swap-notify@example.com' })
    expect(sent!.rendered.text).toContain('Gold Standard Whey')
    expect(sent!.rendered.text).toContain('Impact Whey Isolate')
    expect(sent!.rendered.text).toContain(ALLERGEN_CHECK_SENTENCE)
  })

  it('marks the change as notified, closing the loop', async () => {
    const member = await seedMember('notified@example.com', { defaultChangePolicy: 'auto-swap' })
    await run(OUTAGE, [member])

    const event = await getChange(changeEventId(member.userId, 'l1', 'out-of-stock'))
    expect(event!.status).toBe('applied')
    expect(event!.notifiedAt).not.toBeNull()
  })
})

describe('a removal reaches the member', () => {
  it('states the new monthly and links into the add flow for that category', async () => {
    const member = await seedMember('removed-notify@example.com', { defaultChangePolicy: 'remove' })
    await run(OUTAGE, [member])

    const id = changeEventId(member.userId, 'l1', 'out-of-stock')
    const sent = await getByDedupeKey(dedupeKeyFor(id, 'product-removed'))

    expect(sent!.status).toBe('sent')
    expect(sent!.rendered.text).toContain('£30.00') // what they now pay
    expect(sent!.rendered.text).toContain('/hub?add=protein-whey')
  })

  it('tells a member with dietary needs the honest reason a swap did not happen', async () => {
    const member = await seedMember('vegan-notify@example.com', {
      defaultChangePolicy: 'auto-swap',
      safetyConstraints: { dietaryTags: ['vegan' as DietaryTag], noStimulants: false },
    })
    await run(OUTAGE, [member])

    // Held for review, so drive it through to applied.
    const { applyDueChanges, flushChangeNotifications } = await import('@/lib/changes/service')
    await applyDueChanges({ now: new Date('2026-07-31T09:00:00.000Z'), config: getPricingConfig(), catalogue: CATALOGUE })
    await flushChangeNotifications()

    const id = changeEventId(member.userId, 'l1', 'out-of-stock')
    const sent = await getByDedupeKey(dedupeKeyFor(id, 'product-removed'))

    expect(sent!.rendered.text).toMatch(/dietary requirements you told us about/i)
  })
})

describe('what does not get an email', () => {
  it('says nothing when the outcome left the plan untouched', () => {
    // An absorbed price rise costs the member nothing and changes nothing.
    const sub = subscriptionWith([line({ id: 'l1' })], { customerEmail: 'quiet@example.com' })
    const event = {
      id: 'chg_x', kind: 'price-increase', userId: 'u1', customerEmail: 'quiet@example.com',
      lineId: 'l1', productTitle: 'Creatine', swapGroup: 'creatine',
      resolution: { type: 'absorb' }, intendedAction: { resolution: { type: 'absorb' }, reason: 'price-absorbed-by-default', needsReview: true },
    } as unknown as ChangeEvent

    expect(notificationForEvent(event, { baseUrl: 'https://x.dev', subscription: sub })).toBeNull()
  })

  it('says nothing when there is no address to write to', () => {
    const sub = subscriptionWith([line({ id: 'l1' })], { customerEmail: '' })
    const event = {
      id: 'chg_y', kind: 'out-of-stock', userId: 'u1', customerEmail: null,
      lineId: 'l1', productTitle: 'Whey', swapGroup: 'protein-whey',
      resolution: { type: 'remove' }, intendedAction: { resolution: { type: 'remove' }, reason: 'member-chose-remove', needsReview: false },
    } as unknown as ChangeEvent

    expect(notificationForEvent(event, { baseUrl: 'https://x.dev', subscription: sub })).toBeNull()
  })

  it('never emails twice about one change, however often detection runs', async () => {
    const member = await seedMember('once@example.com', { defaultChangePolicy: 'remove' })
    await run(OUTAGE, [member])
    await run(OUTAGE, [{ userId: member.userId, subscription: (await getSubscription(member.userId))! }])

    const mine = (await listNotifications({ userId: member.userId, limit: 50 }))
    expect(mine).toHaveLength(1)
  })
})

describe('hub deep links', () => {
  it('point at the flow that can act, with the target encoded', () => {
    expect(hubLinks.change('https://chrgd.dev', 'line 1')).toBe('https://chrgd.dev/hub?change=line%201')
    expect(hubLinks.add('https://chrgd.dev', 'protein-whey')).toBe('https://chrgd.dev/hub?add=protein-whey')
  })
})
