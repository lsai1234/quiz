/**
 * @jest-environment node
 */
import { buildSampleMember } from '../members'
import { getSampleOrders, isSampleUserId, sampleMemberIds, testCheckoutRefusal } from '../registry'
import { isSampleEmail, SAMPLE_DOMAIN } from '../domain'
import { DEFAULT_TEST_SWITCHES, withTestSwitches } from '../session'
import { sampleEmails } from '../emails'
import { TEST_VIEWS, SAMPLE_SCENARIOS } from '../views'
import { latestPaidOrderFor, listOrders, getOrder } from '@/lib/orders/repo'
import { getSubscription, listActiveSubscriptions } from '@/lib/db/hub-data'
import { hubAccess } from '@/lib/hub/access'
import { hubHome } from '@/lib/hub/home'
import { hubMetrics } from '@/lib/hub/metrics'
import { listInbox } from '@/lib/trainer/store'
import { countPlans, plansToCheck } from '@/lib/training/store'
import { listNotifications, queueNotification } from '@/lib/notify/outbox'
import { DEFAULT_OFFER } from '@/lib/offer/settings'

const NOW = new Date()

describe('sample members', () => {
  it('live on the sample domain and are known as samples', async () => {
    const { user } = await buildSampleMember('oneoff-day10', NOW)
    expect(user.email).toBe(`oneoff-day10@${SAMPLE_DOMAIN}`)
    expect(isSampleEmail(user.email)).toBe(true)
    expect(await isSampleUserId(user.id)).toBe(true)
    expect((await sampleMemberIds()).has(user.id)).toBe(true)
  })

  it('keep their orders out of the orders table, while their hub reads them', async () => {
    const { user } = await buildSampleMember('oneoff-day10', NOW)
    const orders = await getSampleOrders(user.id)
    expect(orders).toHaveLength(1)
    expect(orders[0].id.startsWith('sample_')).toBe(true)
    // Never a real row: not in any list, not by id.
    expect((await listOrders({ limit: 1000 })).some((o) => o.email === user.email)).toBe(false)
    expect(await getOrder(orders[0].id)).toBeNull()
    // The hub sees them.
    expect((await latestPaidOrderFor({ userId: user.id, email: user.email }))?.id).toBe(orders[0].id)
    expect((await latestPaidOrderFor({ email: user.email }))?.id).toBe(orders[0].id)
    const access = await hubAccess(user, NOW)
    expect(access).toMatchObject({ state: 'member' })
    expect(access.daysLeft).toBe(80)
  })

  it('keep a box plan out of the subscriptions table', async () => {
    const { user } = await buildSampleMember('monthly-active', NOW)
    expect((await getSubscription(user.id))?.status).toBe('active')
    expect((await listActiveSubscriptions()).some((s) => s.customerEmail === user.email)).toBe(false)
    expect((await hubAccess(user, NOW)).state).toBe('subscriber')
  })

  it('build every scenario, and the hub home answers for each', async () => {
    for (const scenario of SAMPLE_SCENARIOS) {
      const { user } = await buildSampleMember(scenario, NOW)
      const home = await hubHome(user, NOW)
      expect(home.access).toBeTruthy()
    }
    const closed = await buildSampleMember('closed', NOW)
    expect((await hubAccess(closed.user, NOW)).state).toBe('ended')
    const paying = await buildSampleMember('hub-paying', NOW)
    expect((await hubAccess(paying.user, NOW)).hubPlan).toBe('active')
  })

  it('are never emailed: their emails are not even stored', async () => {
    const { user } = await buildSampleMember('none', NOW)
    const queued = await queueNotification({ userId: user.id, email: user.email, template: 'trainer-reply', rendered: { subject: 's', text: 't', html: '<p>t</p>' } })
    expect(queued.status).toBe('sent')
    expect(await listNotifications({ userId: user.id })).toHaveLength(0)
  })

  it('never count in the founders’ numbers, and stay out of the real inbox and plans to check', async () => {
    const waiting = await buildSampleMember('plan-waiting', NOW)
    const asked = await buildSampleMember('trainer-waiting', NOW)
    const before = await countPlans()
    expect((await plansToCheck()).some((p) => p.userId === waiting.user.id)).toBe(false)
    expect((await plansToCheck(5000, 'samples')).some((p) => p.userId === waiting.user.id)).toBe(true)
    expect((await listInbox()).some((r) => r.userId === asked.user.id)).toBe(false)
    expect((await listInbox(500, 'samples')).some((r) => r.userId === asked.user.id)).toBe(true)
    expect(await countPlans()).toBe(before)
    const m = await hubMetrics(NOW)
    expect(m.trainingPlans).toBe(before)
  })

  it('can’t pay', async () => {
    const { user } = await buildSampleMember('none', NOW)
    expect(await testCheckoutRefusal({ userId: user.id, email: user.email })).toMatch(/sample account/)
    expect(await testCheckoutRefusal({ userId: 'someone-real', email: 'real@example.com' })).toBeNull()
  })
})

describe('test view switches', () => {
  it('turn parts on for the test view only, with a sample trainer when none is named', () => {
    const s = withTestSwitches(DEFAULT_OFFER, DEFAULT_TEST_SWITCHES)
    expect(s.services).toMatchObject({ training: true, trainer: true, deals: true, checkIns: true })
    expect(s.trainer.name).toBe('Sam')
    expect(s.hubPrice).toMatchObject({ standalone: true })
    // The live settings object is untouched.
    expect(DEFAULT_OFFER.services.training).toBe(false)
    const off = withTestSwitches(DEFAULT_OFFER, { ...DEFAULT_TEST_SWITCHES, trainer: false, hubOnSale: false })
    expect(off.services.trainer).toBe(false)
    expect(off.hubPrice.standalone).toBe(false)
  })
})

describe('the email gallery', () => {
  it('draws every email with sample data and stores none of them', async () => {
    const before = (await listNotifications({ limit: 5000 })).length
    const emails = await sampleEmails(NOW)
    const templates = emails.map((e) => e.template)
    for (const t of ['order-confirmation', 'subscription-confirmation', 'stack-guide', 'check-in', 'trainer-reply', 'hub-plan-welcome', 'payment-failed', 'password-reset']) {
      expect(templates).toContain(t)
    }
    expect(emails.length).toBeGreaterThanOrEqual(20)
    for (const e of emails) {
      expect(e.subject.length).toBeGreaterThan(0)
      expect(e.html).toContain('<')
    }
    expect((await listNotifications({ limit: 5000 })).length).toBe(before)
  })
})

describe('the list of test views', () => {
  it('has a unique id for every view, and every member view names a scenario', () => {
    const ids = TEST_VIEWS.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const v of TEST_VIEWS.filter((x) => x.kind === 'member')) expect(SAMPLE_SCENARIOS).toContain(v.scenario)
  })
})
