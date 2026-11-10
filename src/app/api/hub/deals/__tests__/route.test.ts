/**
 * @jest-environment node
 */
const mockUser: { current: unknown } = { current: null }
jest.mock('@/lib/auth/session', () => ({ getHubUser: async () => mockUser.current }))

import { GET } from '../route'
import { POST as preview } from '../../../hub-preview/route'
import { createUser } from '@/lib/db/users'
import { createOrderFromCheckout } from '@/lib/orders/service'
import { saveServiceSettings } from '@/lib/offer/store'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { dealPreview } from '@/lib/deals/engine'
import type { DealsState } from '@/lib/deals/server'
import type { HubPreview } from '@/lib/hub-preview/build'

process.env.NOTIFY_TEST_ALLOWLIST = '@example.com'

const withDeal = MOCK_CATALOGUE.filter((p) => dealPreview(p, null)).slice(0, 3)

describe('/api/hub/deals', () => {
  afterEach(async () => saveServiceSettings({ deals: false, training: false }))

  it('needs a signed-in member, and says nothing while switched off', async () => {
    mockUser.current = null
    expect((await GET()).status).toBe(401)
    mockUser.current = await createUser({ email: 'off@example.com', password: 'a-long-password-1' } as never)
    expect(await (await GET()).json()).toEqual({ enabled: false, deals: [], hubEndsOn: null, freeOver: 40, hubValue: null })
  })

  it('gives a member a deal on what they bought, with prices and never costs', async () => {
    const email = 'deal-member@example.com'
    mockUser.current = await createUser({ email, password: 'a-long-password-1' } as never)
    await createOrderFromCheckout({
      channel: 'quiz',
      email,
      status: 'paid',
      lines: withDeal.map((p) => ({ sku: null, productId: p.id, title: p.title, quantity: 1, unitPrice: 20 })),
    })
    await saveServiceSettings({ deals: true })
    const s = (await (await GET()).json()) as DealsState
    expect(s.enabled).toBe(true)
    expect(s.deals.map((d) => d.productId).sort()).toEqual(withDeal.map((p) => p.id).sort())
    for (const d of s.deals) {
      expect(d.state).toBe('upcoming')
      expect(d.quote.total).toBeLessThan(d.quote.normalTotal)
      expect(JSON.stringify(d)).not.toMatch(/contribution|floor|marginPct|supplierCost/)
    }
    expect(s.hubEndsOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('/api/hub-preview', () => {
  afterEach(async () => saveServiceSettings({ deals: false, training: false }))
  const ask = (body: unknown) =>
    preview(new Request('http://x/api/hub-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
  const guide = { day: { trainWeekdays: [0, 2, 4], trainDays: 3, trainAt: 1080 }, goals: ['muscle'], training: { types: ['strength'], experience: 'new', focus: 'hypertrophy' } }

  it('shows nothing while both are off', async () => {
    expect(await (await ask({ productIds: withDeal.map((p) => p.id), plan: 'oneoff', guide })).json()).toEqual({ training: null, deals: null })
  })

  it('shows a first week from their answers and the member price of each product', async () => {
    await saveServiceSettings({ deals: true, training: true })
    const p = (await (await ask({ productIds: withDeal.map((x) => x.id), plan: 'oneoff', guide })).json()) as HubPreview
    expect(p.training?.sessions.filter((s) => s.kind === 'strength').map((s) => s.day)).toEqual([0, 2, 4])
    expect(p.deals?.map((d) => d.productId)).toEqual(withDeal.map((x) => x.id))
    expect(JSON.stringify(p)).not.toMatch(/contribution|floor|supplierCost/)
  })

  it('leaves member prices out of a monthly plan', async () => {
    await saveServiceSettings({ deals: true, training: true })
    const p = (await (await ask({ productIds: withDeal.map((x) => x.id), plan: 'subscription', guide })).json()) as HubPreview
    expect(p.deals).toBeNull()
  })
})

describe('/api/hub-preview: the trainer, proven (video phase)', () => {
  const ask = (body: unknown) =>
    preview(new Request('http://x/api/hub-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
  const guide = { day: { trainWeekdays: [0, 2, 4], trainDays: 3, trainAt: 1080 }, goals: ['muscle'], training: { types: ['strength'], experience: 'new', focus: 'hypertrophy' } }
  afterAll(async () => {
    const { saveServiceSettings } = await import('@/lib/offer/store')
    await saveServiceSettings({ training: false, trainer: false, coaching: false, video: false })
  })
  it('adds only what is true: no measured reply or member count below their floors', async () => {
    const { saveServiceSettings, saveTrainerProfile } = await import('@/lib/offer/store')
    const { forgetProof } = await import('@/lib/hub-preview/proof')
    await saveTrainerProfile({ name: 'Sam', qualifications: 'Level 3 Personal Trainer', qualificationsConfirmed: false })
    await saveServiceSettings({ training: true, trainer: true, coaching: true, video: false })
    forgetProof()
    expect((await (await ask({ productIds: [], plan: 'oneoff', guide })).json()).proof).toBeUndefined()
    await saveServiceSettings({ video: true })
    forgetProof()
    const proof = (await (await ask({ productIds: [], plan: 'oneoff', guide })).json()).proof
    expect(proof).toMatchObject({ qualifications: null, reply: null, members: null, workout: true })
    await saveTrainerProfile({ qualificationsConfirmed: true })
    forgetProof()
    expect((await (await ask({ productIds: [], plan: 'oneoff', guide })).json()).proof.qualifications).toBe('Level 3 Personal Trainer')
  })
})
