/**
 * @jest-environment node
 */
import { hubHome } from '../home'
import { createUser } from '@/lib/db/users'
import { saveSubscription } from '@/lib/db/hub-data'
import { createOrderFromCheckout } from '@/lib/orders/service'
import { createMockSubscription } from '@/lib/recharge/mock'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'

/**
 * The hub's home is one request (`/api/hub/home`) that everything on the
 * screen waits for. This holds it to a budget for a member with a plan and a
 * long order history, so a change that makes it do work per order (a query
 * each, a catalogue load each) shows up here rather than on a member's phone.
 *
 * Generous on purpose: it runs on the test database and a shared machine, and
 * is there to catch the kind of slowdown that grows with the member, not a few
 * milliseconds.
 */
const BUDGET_MS = 1500

it('builds a busy member’s home within budget, and stays flat as their orders grow', async () => {
  const email = 'speed-guard@example.com'
  const user = await createUser({ email })
  await saveSubscription(user.id, createMockSubscription(MOCK_CATALOGUE, email))
  const product = MOCK_CATALOGUE.find((p) => p.variants.some((v) => v.available))!
  const order = () =>
    createOrderFromCheckout({ channel: 'shop', email, userId: user.id, status: 'paid', lines: [{ sku: null, productId: product.id, title: product.title, quantity: 1, unitPrice: 20 }] })

  for (let i = 0; i < 5; i++) await order()
  await hubHome(user) // warm: the catalogue and settings are read once per process
  let t = performance.now()
  await hubHome(user)
  const few = performance.now() - t

  for (let i = 0; i < 25; i++) await order()
  t = performance.now()
  const home = await hubHome(user)
  const many = performance.now() - t

  expect(home.orders.length).toBeGreaterThan(5)
  expect(home.plan).not.toBeNull()
  expect(many).toBeLessThan(BUDGET_MS)
  // Six times the orders shouldn't cost anything like six times the time.
  expect(many).toBeLessThan(Math.max(few * 4, 250))
})
