/**
 * @jest-environment node
 */
import { getEngine } from '@/lib/db/engine'
import { kvDelete } from '@/lib/db/kv'
import { createOrderFromCheckout, failOrder, markOrderPaid } from '@/lib/orders/service'
import { getOrder } from '@/lib/orders/repo'
import type { Order, OrderLine } from '@/lib/orders/types'
import { ensureVapidKeys, getVapidKeys } from '../keys'
import { getDevice, listDevices, parseSubscription, saveDevice } from '../devices'
import { getPushPrefs, setPushPrefs } from '../prefs'
import { sendToDevices } from '../send'
import { alertFoundersOfOrder, alertKindOf, orderAlert, wanted } from '../order-alert'

/**
 * The push service is the one thing not run for real here: `web-push` is
 * mocked so each test decides what Apple answers. Everything either side of it
 * — the database, the order funnel, the payload — is the real code.
 */
const sendNotification = jest.fn()
jest.mock('web-push', () => {
  const actual = jest.requireActual('web-push')
  return {
    __esModule: true,
    default: { generateVAPIDKeys: actual.generateVAPIDKeys, sendNotification: (...a: unknown[]) => sendNotification(...a) },
  }
})

const LINES: OrderLine[] = [
  { sku: 'PB-D3K2', productId: 'd3k2', title: 'Vitamin D3 + K2', quantity: 1, unitPrice: 22.95, supplierCost: 9 },
  { sku: 'PB-MAG', productId: 'mag', title: 'Magnesium', quantity: 1, unitPrice: 4, supplierCost: 2 },
]
const ADDRESS = {
  name: 'Sam Customer',
  line1: '9 Private Road',
  city: 'Leeds',
  postcode: 'LS1 4DY',
  country: 'GB',
  email: 'sam@customer.test',
}
const SUB = (n: number) => ({
  endpoint: `https://web.push.apple.com/QOk${n}`,
  keys: { p256dh: 'BOr1Z3l5d3Rr2u8W', auth: 'k8JV6sjdbhAi' },
})

/** An answer from the push service, as `web-push` throws it. */
const refusal = (statusCode: number, body = '') => Object.assign(new Error(`Received unexpected response code`), { statusCode, body })

async function phone(n = 1) {
  return saveDevice({ founderEmail: 'founder@chrgd.test', label: `Founder · iPhone ${n}`, subscription: SUB(n) })
}

/** The message the last send carried, as the service worker will read it. */
function lastPayload() {
  const call = sendNotification.mock.calls.at(-1)
  return JSON.parse(call[1] as string)
}

beforeEach(async () => {
  sendNotification.mockReset()
  sendNotification.mockResolvedValue({ statusCode: 201 })
  const db = await getEngine()
  await db.run('DELETE FROM push_devices')
  await db.run('DELETE FROM orders')
  await kvDelete('push:vapid')
  await kvDelete('push:prefs')
  delete process.env.VAPID_PUBLIC_KEY
  delete process.env.VAPID_PRIVATE_KEY
})

describe('what a notification says', () => {
  const order = (over: Partial<Order> = {}): Order =>
    ({
      id: 'ord_1',
      reference: 'CHRGD-7K4M2XQP',
      channel: 'quiz',
      status: 'paid',
      email: 'sam@customer.test',
      currency: 'GBP',
      subtotal: 26.95,
      shipping: 3.99,
      total: 30.94,
      lines: LINES,
      shippingAddress: ADDRESS,
      events: [],
      ...over,
    }) as Order

  it('reads as a new order: amount, where it came from, the first item and the reference', () => {
    const m = orderAlert(order())
    expect(m.title).toBe('New order · £30.94')
    expect(m.body).toBe('Quiz · Vitamin D3 + K2 and 1 more · CHRGD-7K4M2XQP')
    expect(m.url).toBe('/founderhub/commerce/orders/ord_1')
  })

  it('never puts the customer on the lock screen', () => {
    const text = JSON.stringify(orderAlert(order()))
    for (const secret of ['sam@customer.test', 'Sam Customer', '9 Private Road', 'LS1 4DY']) {
      expect(text).not.toContain(secret)
    }
  })

  it('marks a free order as one to review', () => {
    expect(orderAlert(order({ starterCode: 'PS-1', total: 0 })).title).toBe('Free order to review')
    expect(orderAlert(order({ founderCode: 'FH-FREE-1', founderCodeKind: 'free', total: 0 })).body).toMatch(/^Founder code/)
  })

  it('tells a new subscriber from a renewal', () => {
    const plan = { id: 's', monthly: 39, minMonths: 1, dispatchDayOfMonth: 1, startedAt: '2026-01-01' }
    const first = order({ channel: 'subscription', subscription: { ...plan, cycle: 0 } })
    const renewal = order({ channel: 'subscription', billedAmount: 39, subscription: { ...plan, cycle: 3 } })
    expect(alertKindOf(first)).toBe('subscriber')
    expect(orderAlert(first).title).toBe('New subscriber · £39.00/month')
    expect(alertKindOf(renewal)).toBe('renewal')
    expect(orderAlert(renewal).title).toBe('Renewal · £39.00')
  })

  it('leaves renewals out unless asked for', async () => {
    const prefs = await getPushPrefs()
    expect(wanted('order', prefs)).toBe(true)
    expect(wanted('subscriber', prefs)).toBe(true)
    expect(wanted('renewal', prefs)).toBe(false)
    expect(wanted('renewal', await setPushPrefs({ renewals: true }))).toBe(true)
  })
})

describe('the keys', () => {
  it('are made once and then never change', async () => {
    expect(await getVapidKeys()).toBeNull()
    const first = await ensureVapidKeys()
    const second = await ensureVapidKeys()
    expect(second).toEqual(first)
    expect(first.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/)
  })

  it('come from the environment when both are set there', async () => {
    process.env.VAPID_PUBLIC_KEY = 'pub'
    process.env.VAPID_PRIVATE_KEY = 'priv'
    expect(await getVapidKeys()).toEqual({ publicKey: 'pub', privateKey: 'priv' })
  })
})

describe('a phone joining', () => {
  it('accepts a real push subscription', () => {
    expect(parseSubscription(SUB(1))).toEqual(SUB(1))
  })

  it('refuses anything that would point our server somewhere else', () => {
    expect(parseSubscription({ ...SUB(1), endpoint: 'http://169.254.169.254/latest' })).toBeNull()
    expect(parseSubscription({ ...SUB(1), endpoint: 'not a url' })).toBeNull()
    expect(parseSubscription({ endpoint: SUB(1).endpoint, keys: { p256dh: '<script>', auth: 'x' } })).toBeNull()
    expect(parseSubscription(null)).toBeNull()
  })

  it('is one row however many times it turns on', async () => {
    await phone(1)
    await phone(1)
    expect(await listDevices()).toHaveLength(1)
  })
})

describe('sending', () => {
  beforeEach(async () => {
    await ensureVapidKeys()
  })

  it('reaches every phone and records it', async () => {
    const a = await phone(1)
    await phone(2)
    const result = await sendToDevices({ title: 't', body: 'b', url: '/founderhub', tag: 'x' })
    expect(result).toMatchObject({ sent: 2, failed: 0, removed: 0 })
    expect((await getDevice(a.id))?.lastOkAt).toBeTruthy()
  })

  it('drops a phone Apple says is gone', async () => {
    const a = await phone(1)
    sendNotification.mockRejectedValueOnce(refusal(410))
    const result = await sendToDevices({ title: 't', body: 'b', url: '/founderhub', tag: 'x' })
    expect(result.removed).toBe(1)
    expect(await getDevice(a.id)).toBeNull()
  })

  it('keeps a phone that failed for another reason, with the reason', async () => {
    const a = await phone(1)
    sendNotification.mockRejectedValueOnce(refusal(403, '{"reason":"BadJwtToken"}'))
    const result = await sendToDevices({ title: 't', body: 'b', url: '/founderhub', tag: 'x' })
    expect(result.failed).toBe(1)
    expect((await getDevice(a.id))?.lastError).toMatch(/403.*BadJwtToken/)
  })

  it('does not throw when the push service is unreachable', async () => {
    await phone(1)
    sendNotification.mockRejectedValueOnce(new Error('ETIMEDOUT'))
    await expect(sendToDevices({ title: 't', body: 'b', url: '/founderhub', tag: 'x' })).resolves.toMatchObject({ failed: 1 })
  })
})

describe('an order coming in', () => {
  it('does nothing — and marks nothing — until somebody has turned notifications on', async () => {
    const order = await createOrderFromCheckout({ channel: 'shop', lines: LINES })
    expect(sendNotification).not.toHaveBeenCalled()
    expect((await getOrder(order.id))?.foundersAlertedAt).toBeUndefined()
  })

  it('notifies every phone once a paid order is raised, with the review count for the badge', async () => {
    await ensureVapidKeys()
    await phone(1)
    await phone(2)
    const order = await createOrderFromCheckout({ channel: 'quiz', lines: LINES, shippingAddress: ADDRESS })
    expect(sendNotification).toHaveBeenCalledTimes(2)
    expect(lastPayload()).toMatchObject({ title: 'New order · £26.95', badge: 1, url: `/founderhub/commerce/orders/${order.id}` })
  })

  it('notifies when a Stripe checkout is paid, and only then', async () => {
    await ensureVapidKeys()
    await phone(1)
    const order = await createOrderFromCheckout({ channel: 'shop', lines: LINES, status: 'pending_payment' })
    expect(sendNotification).not.toHaveBeenCalled()

    await markOrderPaid(order.id, { stripeSessionId: 'cs_1', stripePaymentIntentId: 'pi_1' })
    expect(sendNotification).toHaveBeenCalledTimes(1)

    // Stripe delivering the same event again sends nothing more.
    await markOrderPaid(order.id, { stripeSessionId: 'cs_1' })
    expect(sendNotification).toHaveBeenCalledTimes(1)
  })

  it('never notifies for an abandoned checkout', async () => {
    await ensureVapidKeys()
    await phone(1)
    const order = await createOrderFromCheckout({ channel: 'shop', lines: LINES, status: 'pending_payment' })
    await failOrder(order.id, 'Checkout session expired without payment')
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('tells the founders about one order once, however many times it is asked to', async () => {
    await ensureVapidKeys()
    await phone(1)
    const order = await createOrderFromCheckout({ channel: 'shop', lines: LINES })
    await alertFoundersOfOrder((await getOrder(order.id))!)
    expect(sendNotification).toHaveBeenCalledTimes(1)
  })

  it('stays quiet about kinds of order the founders turned off', async () => {
    await ensureVapidKeys()
    await phone(1)
    await setPushPrefs({ orders: false })
    await createOrderFromCheckout({ channel: 'shop', lines: LINES })
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('never fails the order when the push service does', async () => {
    await ensureVapidKeys()
    await phone(1)
    sendNotification.mockRejectedValueOnce(new Error('ECONNRESET'))
    const order = await createOrderFromCheckout({ channel: 'shop', lines: LINES })
    expect((await getOrder(order.id))?.status).toBe('paid')
  })
})
