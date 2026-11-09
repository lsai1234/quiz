/**
 * @jest-environment node
 */
const mockUser: { current: unknown } = { current: null }
jest.mock('@/lib/auth/session', () => ({ getHubUser: async () => mockUser.current }))

import type Stripe from 'stripe'
import { GET as planGet, PATCH as planPatch, POST as planPost } from '@/app/api/hub/plan/route'
import { POST as onboard } from '@/app/api/hub/onboarding/route'
import { createUser } from '@/lib/db/users'
import { saveSubscription, getSubscription } from '@/lib/db/hub-data'
import { createMockSubscription } from '@/lib/recharge/mock'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { createOrderFromCheckout } from '@/lib/orders/service'
import { getOrder, listOrders } from '@/lib/orders/repo'
import { listNotifications } from '@/lib/notify/outbox'
import { saveHubPrice, saveServiceSettings } from '@/lib/offer/store'
import { hubAccess, hubAccessFrom } from '@/lib/hub/access'
import { trainingStart } from '@/lib/training/access'
import { handleStripeEvent } from '@/lib/payments/webhook'
import { linkStripeSubscription } from '@/lib/payments/subscription-link'
import { exportAccount } from '@/lib/db/erasure'
import { firstChargeAt, hubPlanOpen, nextChargeAfterOrder, refundable } from '../plan'
import { getHubPlan, saveHubPlan } from '../store'
import { cancelHubPlan, extendHubPlanFor, resumeHubPlan, startHubPlan } from '../server'

process.env.NOTIFY_TEST_ALLOWLIST = '@example.com'
const DAY = 86_400_000
const NOW = new Date('2026-11-09T12:00:00Z')

let n = 0
async function person() {
  const email = `hubplan-${Date.now()}-${n++}@example.com`
  return createUser({ email, name: 'Alex Member' })
}
const req = (method: string, body?: unknown) => new Request('http://x/api/hub/plan', { method, ...(body ? { body: JSON.stringify(body) } : {}) })

beforeEach(async () => {
  await saveServiceSettings({ training: true })
  await saveHubPrice({ monthly: 10, standalone: true })
})

describe('the rules', () => {
  it('moves a paying member’s next payment back 90 days, so a stack’s free days are never paid for', () => {
    const next = new Date(NOW.getTime() + 10 * DAY).toISOString()
    const moved = nextChargeAfterOrder({ nextChargeAt: next, freeUntil: null }, NOW.toISOString(), NOW)
    expect(Date.parse(moved.nextChargeAt)).toBe(Date.parse(next) + 90 * DAY)
    expect(moved.freeUntil).toBe(moved.nextChargeAt)
  })

  it('on free days already, moves it only as far as the new order’s 90th day', () => {
    const next = new Date(NOW.getTime() + 60 * DAY).toISOString()
    const moved = nextChargeAfterOrder({ nextChargeAt: next, freeUntil: next }, NOW.toISOString(), NOW)
    expect(Date.parse(moved.nextChargeAt)).toBe(NOW.getTime() + 90 * DAY)
    // An order whose 90 days end sooner than the free days already running changes nothing.
    const later = new Date(NOW.getTime() + 120 * DAY).toISOString()
    expect(Date.parse(nextChargeAfterOrder({ nextChargeAt: later, freeUntil: later }, NOW.toISOString(), NOW).nextChargeAt)).toBe(Date.parse(later))
  })

  it('takes a new member’s first payment when their free days end, or now if fewer than two are left', () => {
    expect(firstChargeAt(new Date(NOW.getTime() + 30 * DAY).toISOString(), NOW)).toBe(new Date(NOW.getTime() + 30 * DAY).toISOString())
    expect(firstChargeAt(new Date(NOW.getTime() + DAY).toISOString(), NOW)).toBeNull()
    expect(firstChargeAt(null, NOW)).toBeNull()
  })

  it('refunds only inside 14 days and only once a payment was taken', () => {
    expect(refundable({ startedAt: new Date(NOW.getTime() - 3 * DAY).toISOString(), lastPaymentIntentId: 'pi_1' }, NOW)).toBe(true)
    expect(refundable({ startedAt: new Date(NOW.getTime() - 15 * DAY).toISOString(), lastPaymentIntentId: 'pi_1' }, NOW)).toBe(false)
    expect(refundable({ startedAt: new Date(NOW.getTime() - 3 * DAY).toISOString(), lastPaymentIntentId: null }, NOW)).toBe(false)
  })

  it('keeps the hub open while paid, and to the end of the month paid once cancelled', () => {
    expect(hubPlanOpen({ status: 'active', endsAt: null }, NOW)).toBe(true)
    expect(hubPlanOpen({ status: 'cancelling', endsAt: new Date(NOW.getTime() + DAY).toISOString() }, NOW)).toBe(true)
    expect(hubPlanOpen({ status: 'cancelling', endsAt: new Date(NOW.getTime() - DAY).toISOString() }, NOW)).toBe(false)
    expect(hubPlanOpen({ status: 'pending', endsAt: null }, NOW)).toBe(false)

    const active = hubAccessFrom({ plan: null, latestOrderAt: null, hubPlan: { status: 'active', endsAt: null }, now: NOW })
    expect(active).toMatchObject({ state: 'subscriber', hubPlan: 'active', until: null })
    const ends = new Date(NOW.getTime() + 20 * DAY).toISOString()
    const leaving = hubAccessFrom({ plan: null, latestOrderAt: null, hubPlan: { status: 'cancelling', endsAt: ends }, now: NOW })
    expect(leaving).toMatchObject({ state: 'member', hubPlan: 'cancelling', until: ends.slice(0, 10) })
    // An order's 90 days outlast a cancelled membership's paid month.
    const withOrder = hubAccessFrom({ plan: null, latestOrderAt: NOW.toISOString(), hubPlan: { status: 'cancelling', endsAt: ends }, now: NOW })
    expect(withOrder.until).toBe(new Date(NOW.getTime() + 90 * DAY).toISOString().slice(0, 10))
    // A stack order alone never makes a membership: the 90 days just end.
    const stackOnly = hubAccessFrom({ plan: null, latestOrderAt: new Date(NOW.getTime() - 91 * DAY).toISOString(), hubPlan: null, now: NOW })
    expect(stackOnly).toMatchObject({ state: 'ended', hubPlan: null })
  })
})

describe('joining (mock payments)', () => {
  it('is refused while it isn’t on sale, or has nothing in it to sell', async () => {
    await saveHubPrice({ standalone: false })
    const u = await person()
    mockUser.current = u
    expect((await planPost(req('POST'))).status).toBe(404)
    await saveHubPrice({ standalone: true })
    await saveServiceSettings({ training: false, trainer: false })
    expect((await planPost(req('POST'))).status).toBe(404)
    expect(await getHubPlan(u.id)).toBeNull()
  })

  it('joins, opens the hub, sends one welcome, then the quiz saves their answers for the training plan', async () => {
    const u = await person()
    mockUser.current = u
    const res = await planPost(req('POST'))
    expect(res.status).toBe(200)
    const body = await res.json()
    // No answers on record yet: the quiz in hub mode, not the results page.
    expect(body).toMatchObject({ ok: true, mock: true, checkoutUrl: '/?then=hub' })

    const plan = await getHubPlan(u.id)
    expect(plan).toMatchObject({ status: 'active', monthly: 10 })
    expect((await hubAccess(u)).state).toBe('subscriber')
    const welcomes = (await listNotifications({ userId: u.id })).filter((x) => x.template === 'hub-plan-welcome')
    expect(welcomes).toHaveLength(1)
    expect(welcomes[0].rendered.text).toContain('£10 a month')

    const saved = await onboard(new Request('http://x', { method: 'POST', body: JSON.stringify({ seed: { day: { trainDays: 3 }, goals: ['muscle', 'nonsense'], firstName: 'alex', training: { types: ['gym'], experience: 'some', focus: null }, symptoms: ['should not be kept'] } }) }))
    expect(saved.status).toBe(200)
    const start = await trainingStart(u)
    expect(start.goals).toEqual(['muscle'])
    expect(JSON.stringify(await exportAccount(u.id))).not.toContain('should not be kept')

    // Already a member: the join page says so, and a second join is refused.
    const state = await (await planGet()).json()
    expect(state.join.refusal).toBe('already')
    expect((await planPost(req('POST'))).status).toBe(409)
  })

  it('is refused while a monthly box plan is running: the plan includes the hub', async () => {
    const u = await person()
    await saveSubscription(u.id, createMockSubscription(MOCK_CATALOGUE, u.email))
    mockUser.current = u
    expect((await planPost(req('POST'))).status).toBe(409)
  })

  it('starts paying when a stack’s free days end, and goes straight to the hub when the quiz was already taken', async () => {
    const u = await person()
    await createOrderFromCheckout({ channel: 'quiz', email: u.email, userId: u.id, status: 'paid', guideSeed: { day: { trainDays: 3 }, goals: ['energy'], firstName: 'Alex', stackName: null }, lines: [{ sku: null, productId: MOCK_CATALOGUE[0].id, title: 'x', quantity: 1, unitPrice: 20 }] } as never)
    const out = await startHubPlan(u, 'http://x')
    expect(out.checkoutUrl).toBe('/myhub?joined=1')
    const plan = (await getHubPlan(u.id))!
    expect(Date.parse(plan.nextChargeAt!)).toBeGreaterThan(Date.now() + 80 * DAY)
    expect(plan.freeUntil).toBe(plan.nextChargeAt)
  })
})

describe('a stack order while a member', () => {
  it('moves the next payment back and says so once', async () => {
    const u = await person()
    await startHubPlan(u, 'http://x')
    const before = (await getHubPlan(u.id))!.nextChargeAt!
    const order = await createOrderFromCheckout({ channel: 'quiz', email: u.email, userId: u.id, status: 'paid', lines: [{ sku: null, productId: MOCK_CATALOGUE[0].id, title: 'x', quantity: 1, unitPrice: 20 }] } as never)
    const after = (await getHubPlan(u.id))!
    expect(Date.parse(after.nextChargeAt!)).toBe(Date.parse(before) + 90 * DAY)
    // A second pass over the same order moves nothing.
    await extendHubPlanFor(order)
    expect((await getHubPlan(u.id))!.nextChargeAt).toBe(after.nextChargeAt)
    expect((await listNotifications({ userId: u.id })).filter((x) => x.template === 'hub-plan-moved')).toHaveLength(1)
  })
})

describe('cancelling', () => {
  it('within 14 days of a payment refunds and ends now; otherwise runs to the end of the month paid, and can be kept', async () => {
    const a = await person()
    await startHubPlan(a, 'http://x')
    await saveHubPlan({ ...(await getHubPlan(a.id))!, lastPaymentIntentId: 'pi_x' })
    const refunded = await cancelHubPlan(a.id)
    expect(refunded).toMatchObject({ status: 'cancelled' })
    expect((await hubAccess(a)).state).not.toBe('subscriber')

    const b = await person()
    await startHubPlan(b, 'http://x')
    const plan = (await getHubPlan(b.id))!
    await saveHubPlan({ ...plan, startedAt: new Date(Date.now() - 20 * DAY).toISOString(), lastPaymentIntentId: 'pi_y' })
    mockUser.current = b
    const res = await planPatch(req('PATCH', { action: 'cancel' }))
    const view = (await res.json()).membership
    expect(view).toMatchObject({ status: 'cancelling', endsAt: plan.nextChargeAt })
    expect((await hubAccess(b)).state).toBe('member')
    expect((await listNotifications({ userId: b.id })).filter((x) => x.template === 'hub-plan-cancelled')).toHaveLength(1)

    const kept = await resumeHubPlan(b.id)
    expect(kept).toMatchObject({ status: 'active', endsAt: null })
  })
})

describe('Stripe events for a hub plan', () => {
  const hubSession = (userId: string, subId: string): Stripe.Event =>
    ({ id: 'evt_h1', type: 'checkout.session.completed', data: { object: { id: 'cs_h1', mode: 'subscription', client_reference_id: userId, subscription: subId, customer: 'cus_h1', metadata: { userId, plan: 'hub' } } } }) as unknown as Stripe.Event
  const invoice = (subId: string, id: string, meta: Record<string, string> | null): Stripe.Event =>
    ({
      id: 'evt_hi',
      type: 'invoice.paid',
      data: { object: { id, subscription: subId, billing_reason: 'subscription_cycle', amount_paid: 1000, payment_intent: 'pi_h1', lines: { data: [{ period: { end: Math.floor((Date.now() + 30 * DAY) / 1000) } }] }, parent: meta ? { subscription_details: { subscription: subId, metadata: meta } } : null } },
    }) as unknown as Stripe.Event

  it('activates on checkout, and its payments never raise a box order or touch a box plan', async () => {
    const u = await person()
    // A box plan on the same account (cancelled), to prove nothing reaches it.
    const box = { ...createMockSubscription(MOCK_CATALOGUE, u.email), status: 'cancelled' as const }
    await saveSubscription(u.id, box)
    await saveHubPlan({ v: 1, userId: u.id, email: u.email, status: 'pending', monthly: 10, startedAt: null, nextChargeAt: null, freeUntil: null, endsAt: null, lastPaymentIntentId: null, stripeSubscriptionId: null, stripeCustomerId: null, cancelledAt: null, updatedAt: new Date().toISOString() })

    const done = await handleStripeEvent(hubSession(u.id, 'sub_hub_1'))
    expect(done).toMatchObject({ handled: true, userId: u.id })
    expect(await getHubPlan(u.id)).toMatchObject({ status: 'active', stripeSubscriptionId: 'sub_hub_1', stripeCustomerId: 'cus_h1' })
    // The box plan's own checkout handling never ran.
    expect((await getSubscription(u.id))?.status).toBe('cancelled')

    // Tagged invoice: recorded on the membership, no order.
    const paid = await handleStripeEvent(invoice('sub_hub_1', 'in_hub_1', { userId: u.id, plan: 'hub' }))
    expect(paid).toMatchObject({ handled: true, userId: u.id })
    expect(await getOrder('ord_inv_in_hub_1')).toBeNull()
    expect((await getHubPlan(u.id))!.lastPaymentIntentId).toBe('pi_h1')

    // Untagged (older API shape): still recognised by the plan on record, still no order.
    await handleStripeEvent(invoice('sub_hub_1', 'in_hub_2', null))
    expect(await getOrder('ord_inv_in_hub_2')).toBeNull()
    expect((await listOrders({ channel: 'subscription' })).filter((o) => o.userId === u.id)).toHaveLength(0)

    // Cancelled in Stripe: the membership ends; the box plan is left alone.
    await handleStripeEvent({ id: 'evt_hd', type: 'customer.subscription.deleted', data: { object: { id: 'sub_hub_1', metadata: { userId: u.id, plan: 'hub' } } } } as unknown as Stripe.Event)
    expect((await getHubPlan(u.id))!.status).toBe('cancelled')
    expect((await getSubscription(u.id))?.status).toBe('cancelled')
  })

  it('leaves box plan events to the box handlers', async () => {
    const u = await person()
    await saveSubscription(u.id, createMockSubscription(MOCK_CATALOGUE, u.email))
    await linkStripeSubscription('sub_box_9', u.id)
    await handleStripeEvent({ id: 'evt_b', type: 'invoice.paid', data: { object: { id: 'in_box_9', subscription: 'sub_box_9', billing_reason: 'subscription_create' } } } as unknown as Stripe.Event)
    expect(await getOrder('ord_inv_in_box_9')).not.toBeNull()
  })
})
