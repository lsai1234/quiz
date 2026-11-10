/**
 * @jest-environment node
 */
import { buildSampleMember, resetSampleMembers } from '../members'
import { getSampleOrders, isSampleUserId, sampleMemberIds, testCheckoutRefusal } from '../registry'
import { isSampleEmail, SAMPLE_DOMAIN } from '../domain'
import { DEFAULT_TEST_SWITCHES, normaliseSwitches, withTestSwitches } from '../session'
import { withSampleOffer, SAMPLE_HERO_CHECKER } from '../offer'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { activeBonusPool, activeHeroIds, claimChoicesFor, emptyHeroApproval } from '@/lib/offer/settings'
import { offerable } from '@/lib/offer/select'
import { publicOffer } from '@/lib/offer/public'
import { getThread } from '@/lib/trainer/store'
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
    expect((await listActiveSubscriptions()).some((s) => s.userId === user.id)).toBe(false)
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

  it('start with the hero and the gift off, and a view opened before they existed reads them as off', () => {
    expect(DEFAULT_TEST_SWITCHES).toMatchObject({ hero: false, gift: false })
    const old = normaliseSwitches({ training: true, trainer: true, deals: true, checkIns: true, hubOnSale: true, coaching: true, video: true, programmes: true })
    expect(old).toMatchObject({ hero: false, gift: false })
    const s = withTestSwitches(DEFAULT_OFFER, { ...DEFAULT_TEST_SWITCHES, hero: true, gift: true })
    expect(s.heroEnabled).toBe(true)
    expect(s.bonus.enabled).toBe(true)
    // Switched off in the test view, they're off there whatever is live.
    const liveOn = { ...DEFAULT_OFFER, heroEnabled: true, bonus: { ...DEFAULT_OFFER.bonus, enabled: true } }
    const offInView = withTestSwitches(liveOn, DEFAULT_TEST_SWITCHES)
    expect(offInView.heroEnabled).toBe(false)
    expect(offInView.bonus.enabled).toBe(false)
  })
})

describe('the hero and the gift in a test view', () => {
  const TODAY = '2026-11-10'
  const on = { ...DEFAULT_OFFER, heroEnabled: true, bonus: { ...DEFAULT_OFFER.bonus, enabled: true } }

  it('use any product on sale as a sample hero and gift when nothing is set', async () => {
    const { products } = await getResolvedCatalogue()
    const onSale = products.filter(offerable).map((p) => p.id).sort()
    const s = withSampleOffer(on, products, TODAY)
    expect(activeHeroIds(s, products, TODAY)).toEqual(onSale)
    expect(activeBonusPool(s, products).sort()).toEqual(onSale)
    for (const id of onSale) expect(s.heroes[id]).toMatchObject({ checkedBy: SAMPLE_HERO_CHECKER, claimId: 'none', checkedAt: '2026-11-09' })
    // What the results page reads takes them, as it would real ones.
    const shown = publicOffer(s, products, { today: TODAY, bonusShown: true })
    expect(shown.heroEnabled).toBe(true)
    expect(shown.bonus.enabled).toBe(true)
    // The founders' own settings are untouched.
    expect(on.heroes).toEqual({})
    expect(on.bonus.pool).toEqual([])
  })

  it('use only the products a founder has switched on as a hero, keeping a claim valid for its kind', async () => {
    const { products } = await getResolvedCatalogue()
    const withClaim = products.filter(offerable).find((p) => claimChoicesFor(p.swapGroup).length > 0)!
    const other = products.filter(offerable).find((p) => p.id !== withClaim.id)!
    const claimId = claimChoicesFor(withClaim.swapGroup)[0].id
    const started = {
      ...on,
      heroes: {
        [withClaim.id]: { ...emptyHeroApproval(withClaim.id), hero: true, claimId },
        [other.id]: { ...emptyHeroApproval(other.id), hero: true, claimId: 'not-a-claim' },
      },
    }
    const s = withSampleOffer(started, products, TODAY)
    expect(activeHeroIds(s, products, TODAY)).toEqual([withClaim.id, other.id].sort())
    expect(s.heroes[withClaim.id].claimId).toBe(claimId)
    expect(s.heroes[other.id].claimId).toBe('none')
  })

  it('leave real approved heroes and a real pool alone, and do nothing while switched off', async () => {
    const { products } = await getResolvedCatalogue()
    const p = products.filter(offerable)[0]
    const real = {
      ...on,
      heroes: { [p.id]: { ...emptyHeroApproval(p.id), hero: true, legalGB: true, novelFood: 'not-novel' as const, safetyReviewed: true, claimId: 'none', checkedBy: 'A founder', checkedAt: '2026-11-01' } },
      bonus: { ...on.bonus, pool: [p.id] },
    }
    expect(withSampleOffer(real, products, TODAY)).toBe(real)
    expect(withSampleOffer(DEFAULT_OFFER, products, TODAY)).toBe(DEFAULT_OFFER)
  })
})

describe('the sample trainer inbox’s library and exchange', () => {
  it('show only in a test view, never reach the real ones, and go with Reset sample data', async () => {
    const content = await import('@/lib/trainer/content')
    const { user } = await buildSampleMember('trainer-video', NOW)
    const answer = (await getThread(user.id))!.messages.find((m) => m.from === 'trainer' && !m.kind && m.shareOk === true)!
    expect(answer).toBeDefined()

    // A sample member's answer can't go to the real results page.
    await expect(content.setFeatured({ userId: user.id, messageId: answer.id })).rejects.toEqual(new content.ContentError('missing'))
    await content.setFeatured({ userId: user.id, messageId: answer.id }, NOW, 'sample')
    expect(await content.getFeatured('live')).toBeNull()
    expect((await content.shownFeatured(true))?.source.messageId).toBe(answer.id)
    expect(await content.shownFeatured(false)).toBeNull()

    await content.saveLibraryEntry({ question: 'Sample: how deep?', answer: 'As deep as your heels stay down.' }, NOW, 'sample')
    expect((await content.library('live')).some((e) => e.question === 'Sample: how deep?')).toBe(false)
    expect((await content.shownLibrary(true)).some((e) => e.question === 'Sample: how deep?')).toBe(true)
    expect((await content.shownLibrary(false)).some((e) => e.question === 'Sample: how deep?')).toBe(false)

    // A member's no takes it down wherever it is.
    expect(await content.withdrawFeatured(user.id, answer.id)).toBe(true)
    expect(await content.getFeatured('sample')).toBeNull()

    await content.setFeatured({ userId: user.id, messageId: answer.id }, NOW, 'sample')
    await resetSampleMembers()
    expect(await content.getFeatured('sample')).toBeNull()
    expect(await content.library('sample')).toEqual([])
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
