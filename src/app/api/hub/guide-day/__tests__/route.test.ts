/**
 * @jest-environment node
 */
const mockUser: { current: unknown } = { current: null }
jest.mock('@/lib/auth/session', () => ({ getHubUser: async () => mockUser.current }))

import { PUT } from '../route'
import { createUser } from '@/lib/db/users'
import { saveSubscription } from '@/lib/db/hub-data'
import { createMockSubscription } from '@/lib/recharge/mock'
import { buildGuide, normaliseGuideSeed } from '@/lib/guide/build'
import { getGuide, newGuideToken, saveGuide } from '@/lib/guide/store'
import { MOCK_CATALOGUE } from '@/lib/catalogue'

const put = (body: unknown) => PUT(new Request('http://x/api/hub/guide-day', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))

it('needs a signed-in member with a guide', async () => {
  mockUser.current = null
  expect((await put({ wake: 300 })).status).toBe(401)
  mockUser.current = await createUser({ email: 'no-guide-day@example.com' })
  expect((await put({ wake: 300 })).status).toBe(409)
})

it('saves their day to their plan’s guide', async () => {
  const user = await createUser({ email: 'guide-day@example.com' })
  mockUser.current = user
  const token = newGuideToken()
  const products = MOCK_CATALOGUE.filter((p) => p.variants.some((v) => v.available)).slice(0, 3)
  await saveGuide(buildGuide({ token, now: new Date().toISOString(), plan: 'subscription', lines: products.map((p) => ({ productId: p.id })), seed: normaliseGuideSeed({}), catalogue: MOCK_CATALOGUE }))
  await saveSubscription(user.id, { ...createMockSubscription(MOCK_CATALOGUE, user.email ?? ''), guideToken: token })

  const res = await put({ wake: 330, bed: 1290, trainAt: 1080, trainWeekdays: [1, 3] })
  expect(res.status).toBe(200)
  expect((await getGuide(token))?.routine.day).toMatchObject({ wake: 330, bed: 1290, trainAt: 1080, trainWeekdays: [1, 3], assumed: false })
})
