import { issueGuideForOrder, issueGuideForSubscription } from '../issue'
import { getGuide } from '../store'
import { createOrderFromCheckout } from '@/lib/orders/service'
import { getOrder } from '@/lib/orders/repo'
import { listNotifications } from '@/lib/notify/outbox'
import { getSubscription, saveSubscription } from '@/lib/db/hub-data'
import { createUser } from '@/lib/db/users'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import type { MemberSubscription } from '@/lib/recharge/types'
import { saveServiceSettings } from '@/lib/offer/store'

process.env.NOTIFY_TEST_ALLOWLIST = '@example.com'

const ids = MOCK_CATALOGUE.slice(0, 3).map((p) => p.id)
const seed = { day: { wake: 400, bed: 1350, trainAt: 1080, trainDays: 3, trainWeekdays: [0, 2, 4], assumed: false }, goals: ['muscle'], firstName: 'alex', stackName: 'Strength Engine Stack' }

describe('every order gets a stack guide', () => {
  it('makes one guide for a paid one-off, keeps it on the order, and queues one email', async () => {
    const order = await createOrderFromCheckout({
      channel: 'quiz',
      email: 'buyer@example.com',
      status: 'paid',
      lines: ids.map((productId) => ({ sku: null, productId, title: productId, quantity: 1, unitPrice: 10 })),
      guideSeed: seed as never,
    })
    // `createOrderFromCheckout` confirms a paid order, which issues the guide.
    const stored = await getOrder(order.id)
    expect(stored?.guideToken).toMatch(/^[A-Za-z0-9_-]{24}$/)
    const guide = await getGuide(stored!.guideToken!)
    expect(guide?.products.map((p) => p.id)).toEqual(ids)
    expect(guide?.firstName).toBe('Alex')
    expect(guide?.routine.day.wake).toBe(400)

    // Once: a second call (a webhook redelivery) changes nothing and sends nothing new.
    expect(await issueGuideForOrder(stored!)).toBe(stored!.guideToken)
    const sent = (await listNotifications({ limit: 50 })).filter((n) => n.template === 'stack-guide' && n.email === 'buyer@example.com')
    expect(sent).toHaveLength(1)
    expect(sent[0].rendered.html).toContain(`/api/guide/${stored!.guideToken}/image`)
  })

  it('still makes the guide for a guest with no email, for the confirmation page', async () => {
    const order = await createOrderFromCheckout({
      channel: 'quiz',
      email: null,
      status: 'paid',
      lines: ids.map((productId) => ({ sku: null, productId, title: productId, quantity: 1, unitPrice: 10 })),
    })
    const stored = await getOrder(order.id)
    expect(await getGuide(stored!.guideToken!)).not.toBeNull()
  })

  it('makes one guide for a plan and keeps its token on the plan', async () => {
    const user = await createUser({ email: 'member@example.com', password: 'a-long-password-1' } as never)
    const userId = (user as { id: string }).id
    const sub = {
      id: 'sub-1', status: 'active', customerEmail: 'member@example.com', flatMonthly: 40,
      lines: ids.map((productId, i) => ({ id: `l${i}`, productId, usageLevel: 'standard' })),
      guideSeed: seed,
    } as unknown as MemberSubscription
    await saveSubscription(userId, sub)
    const token = await issueGuideForSubscription(userId, sub, null)
    expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/)
    expect((await getSubscription(userId))?.guideToken).toBe(token)
    expect((await getGuide(token!))?.plan).toBe('subscription')
  })

  it('flags a Supercharged box for the pharmacist check only while the switch is on', async () => {
    const make = (n: number) =>
      createOrderFromCheckout({
        channel: 'quiz', email: null, status: 'paid',
        lines: MOCK_CATALOGUE.slice(0, n).map((p) => ({ sku: null, productId: p.id, title: p.id, quantity: 1, unitPrice: 10 })),
      }).then((o) => getOrder(o.id))
    expect((await make(4))?.services).toBeUndefined()
    await saveServiceSettings({ pharmacistCheck: true })
    const big = await make(4)
    expect(big?.services).toEqual(['pharmacistCheck'])
    expect(big?.events.some((e) => e.type === 'service' && /Pharmacist check/.test(e.detail ?? ''))).toBe(true)
    expect((await make(2))?.services).toBeUndefined()
    await saveServiceSettings({ pharmacistCheck: false })
  })
})
