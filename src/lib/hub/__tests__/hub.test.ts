/**
 * @jest-environment node
 */
const mockUser: { current: unknown } = { current: null }
jest.mock('@/lib/auth/session', () => ({ getHubUser: async () => mockUser.current }))

import { hubAccessFrom } from '../access'
import { todayFrom } from '../home'
import { GET as home } from '@/app/api/hub/home/route'
import { POST as tick } from '@/app/api/hub/today/route'
import { POST as link } from '@/app/api/hub/link-order/route'
import { createUser } from '@/lib/db/users'
import { createOrderFromCheckout } from '@/lib/orders/service'
import { getOrder, saveOrder } from '@/lib/orders/repo'
import { getEngine } from '@/lib/db/engine'
import { listNotifications } from '@/lib/notify/outbox'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { pickTips, faqsFor } from '@/lib/tips/pick'
import { TIPS, FAQS } from '@/lib/tips/library'
import { saveServiceSettings } from '@/lib/offer/store'
import { sweepDealEmails, dealEmailsOff, stopByToken } from '@/lib/deals/emails'
import { dealPreview, variantFor } from '@/lib/deals/engine'
import type { HubHome } from '../home-types'

process.env.NOTIFY_TEST_ALLOWLIST = '@example.com'
const DAY = 86_400_000
const NOW = new Date('2026-11-05T09:00:00Z')

describe('who the hub is open to', () => {
  it('a one-off order opens it for 90 days', () => {
    const a = hubAccessFrom({ plan: null, latestOrderAt: new Date(NOW.getTime() - 10 * DAY).toISOString(), now: NOW })
    expect(a).toMatchObject({ state: 'member', daysLeft: 80 })
  })
  it('a running plan keeps it open; a cancelled one for 90 days after', () => {
    expect(hubAccessFrom({ plan: { status: 'active' }, latestOrderAt: null, now: NOW }).state).toBe('subscriber')
    const c = hubAccessFrom({ plan: { status: 'cancelled', cancelledAt: new Date(NOW.getTime() - 30 * DAY).toISOString() }, latestOrderAt: new Date(NOW.getTime() - 200 * DAY).toISOString(), now: NOW })
    expect(c).toMatchObject({ state: 'member', daysLeft: 60 })
  })
  it('closes after 90 days, and was never open without an order', () => {
    expect(hubAccessFrom({ plan: null, latestOrderAt: new Date(NOW.getTime() - 91 * DAY).toISOString(), now: NOW }).state).toBe('ended')
    expect(hubAccessFrom({ plan: null, latestOrderAt: null, now: NOW }).state).toBe('none')
  })
})

describe('tips', () => {
  const ctx = { kinds: ['creatine', 'protein-whey'] as never[], moments: ['morning', 'post-workout'] as never[], trains: true }
  it('three a week, product tips first, never repeating until all have been seen', () => {
    const w1 = pickTips(ctx, '2026-11-02', [])
    expect(w1.tips).toHaveLength(3)
    expect(w1.tips[0].kinds).toBeDefined()
    const w2 = pickTips(ctx, '2026-11-09', w1.seen)
    expect(w2.tips.some((t) => w1.tips.includes(t))).toBe(false)
    // Same week, same tips.
    expect(pickTips(ctx, '2026-11-02', []).tips).toEqual(w1.tips)
  })
  it('never shows a training tip to someone who doesn’t train, or a product tip for one they don’t have', () => {
    const t = pickTips({ kinds: ['omega-3'] as never[], moments: [], trains: false }, '2026-11-02', [])
    for (const tip of t.tips) {
      expect(tip.trains).not.toBe(true)
      if (tip.kinds) expect(tip.kinds).toContain('omega-3')
    }
  })
  it('says nothing about health', () => {
    const words = [...TIPS.flatMap((t) => [t.title, t.text]), ...FAQS.flatMap((f) => [f.q, f.a])].join(' ')
    expect(words).not.toMatch(/\b(health|immune|energy|boost\w*|improv\w*|support\w*|recover\w*|muscle growth|burn\w*|detox|cure|treat\w*)\b/i)
    expect(faqsFor('creatine')[0].q).toBe('Can I take it on rest days?')
  })
})

describe('the hub home', () => {
  afterEach(async () => saveServiceSettings({ deals: false, training: false }))

  async function member(email: string) {
    const user = (await createUser({ email, password: 'a-long-password-1' } as never)) as { id: string; email: string; name: string | null }
    await createOrderFromCheckout({
      channel: 'quiz',
      email,
      status: 'paid',
      lines: MOCK_CATALOGUE.slice(0, 3).map((p) => ({ sku: null, productId: p.id, title: p.title, quantity: 1, unitPrice: 20 })),
      guideSeed: { day: { wake: 420, bed: 1380, trainAt: 1080, trainDays: 3, trainWeekdays: [0, 2, 4], assumed: false }, goals: ['muscle'], firstName: 'jo', stackName: 'Test Stack' } as never,
    })
    mockUser.current = user
    return user
  }

  it('needs a signed-in member', async () => {
    mockUser.current = null
    expect((await home()).status).toBe(401)
  })

  it('gathers today, the guide, tips and orders, and ticks persist for the day', async () => {
    await member('home-member@example.com')
    const h = (await (await home()).json()) as HubHome
    expect(h.access.state).toBe('member')
    expect(h.firstName).toBe('Jo')
    expect(h.guide?.products.length).toBe(3)
    expect(h.today?.items.length).toBeGreaterThan(0)
    expect(h.tips.length).toBeGreaterThan(0)
    expect(h.orders).toHaveLength(1)
    const first = h.today!.items[0]
    const res = await tick(new Request('http://x', { method: 'POST', body: JSON.stringify({ productId: first.productId, done: true }) }))
    expect((await res.json()).done).toContain(first.productId)
    const again = (await (await home()).json()) as HubHome
    expect(again.today!.items.find((i) => i.productId === first.productId)?.done).toBe(true)
    // The same tips all week.
    expect(again.tips.map((t) => t.id)).toEqual(h.tips.map((t) => t.id))
  })

  it('leaves training-day products off rest days', () => {
    const guide = {
      routine: {
        day: { trainWeekdays: [0] },
        moments: [{ minutes: 600, label: 'x', items: [{ productId: 'pre', title: 'Pre', minutes: 600, moment: 'Before training', amount: '1', days: 'training-days' }, { productId: 'd', title: 'D', minutes: 600, moment: 'm', amount: '1', days: 'every-day' }] }],
      },
    } as never
    const tuesday = new Date('2026-11-03T09:00:00Z')
    expect(todayFrom(guide, tuesday, []).map((i) => i.productId)).toEqual(['d'])
    expect(todayFrom(guide, new Date('2026-11-02T09:00:00Z'), []).map((i) => i.productId)).toEqual(['pre', 'd'])
  })
})

describe('joining an order made under another email', () => {
  it('sends a code only where there are orders, and the right code joins them', async () => {
    const other = 'old-address@example.com'
    const order = await createOrderFromCheckout({ channel: 'shop', email: other, status: 'paid', lines: [{ sku: null, productId: MOCK_CATALOGUE[0].id, title: 'x', quantity: 1, unitPrice: 20 }] })
    const user = (await createUser({ email: 'new-address@example.com', password: 'a-long-password-1' } as never)) as { id: string }
    mockUser.current = user
    const ask = (body: unknown) => link(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }))
    expect((await (await ask({ email: other })).json()).sent).toBe(true)
    expect((await (await ask({ email: 'nobody@example.com' })).json()).sent).toBe(true)
    const sent = (await listNotifications({ limit: 50 })).filter((n) => n.template === 'order-link-code' && n.email === other)
    expect(sent).toHaveLength(1)
    expect((await listNotifications({ limit: 50 })).some((n) => n.template === 'order-link-code' && n.email === 'nobody@example.com')).toBe(false)
    const code = sent[0].rendered.text.match(/\b(\d{6})\b/)![1]
    const wrong = await ask({ code: code === '000000' ? '111111' : '000000' })
    expect(wrong.status).toBe(400)
    const ok = await ask({ code })
    expect((await ok.json()).linked).toBe(1)
    expect((await getOrder(order.id))?.userId).toBe(user.id)
  })
})

describe('deal emails', () => {
  afterAll(async () => saveServiceSettings({ deals: false }))
  it('one email when a deal opens, deduped, and a stop link that works', async () => {
    await saveServiceSettings({ deals: true })
    const product = MOCK_CATALOGUE.find((p) => dealPreview(p, null))!
    const email = 'deal-email@example.com'
    const order = await createOrderFromCheckout({ channel: 'shop', email, status: 'paid', lines: [{ sku: null, productId: product.id, title: product.title, variantTitle: variantFor(product, null)!.title, quantity: 1, unitPrice: 20 }] })
    // Bought so that its deal opens today.
    const preview = dealPreview(product, null)!
    const opensAfterDays = preview.weeks * 7
    const db = await getEngine()
    await db.run('DELETE FROM orders WHERE id = ?', [order.id])
    const now = new Date()
    // Find the day this deal opens, by asking the engine directly.
    const { memberDeals } = await import('@/lib/deals/engine')
    let boughtAt = new Date(now.getTime() - opensAfterDays * DAY)
    for (let shift = -10; shift <= 10; shift++) {
      const at = new Date(now.getTime() - (opensAfterDays + shift) * DAY)
      const d = memberDeals({ purchases: [{ productId: product.id, quantity: 1, at: at.toISOString() }], products: MOCK_CATALOGUE, answers: null, now }).deals[0]
      if (d?.opensOn === now.toISOString().slice(0, 10)) {
        boughtAt = at
        break
      }
    }
    await saveOrder({ ...order, createdAt: boughtAt.toISOString() })
    const first = await sweepDealEmails(now)
    expect(first.sent).toBe(1)
    await sweepDealEmails(now)
    const notes = (await listNotifications({ limit: 100 })).filter((n) => n.template === 'deal-open' && n.email === email)
    expect(notes).toHaveLength(1)
    expect(notes[0].rendered.html).toContain('/myhub/emails?stop=')
    const token = notes[0].rendered.html.match(/stop=([A-Za-z0-9_-]+)/)![1]
    expect(await stopByToken(token)).toBe(true)
    expect(await dealEmailsOff(email)).toBe(true)
  })
})
