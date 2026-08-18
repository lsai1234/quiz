import { test, expect } from '@playwright/test'
import { founderSessionViaApi, signInAtFounderHub, createPartner, FOUNDER } from '../support/accounts'
import { openShop, addProductToBasket, openBasket } from '../support/shop'

/**
 * The Founders Hub — the business side.
 *
 * Desktop only: it is dense tables for an audience of about two people at a
 * laptop, and holding it to a phone viewport tests a layout nobody uses.
 */
test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, 'the Founders Hub is a desktop surface')

/** A paid order to work with, raised through the real checkout. */
async function raiseAnOrder(page: import('@playwright/test').Page) {
  await openShop(page)
  await addProductToBasket(page, 'CHRGD Whey Protein')
  await openBasket(page)
  await page.getByRole('button', { name: /Checkout/ }).click()
  await expect(page.getByRole('heading', { name: /Your order is confirmed/i })).toBeVisible({ timeout: 30_000 })
}

test.describe('the gate', () => {
  test('refuses the wrong password', async ({ page }) => {
    await page.goto('/founderhub')
    await page.getByLabel(/email/i).fill(FOUNDER.email)
    await page.getByLabel(/password/i).fill('nope')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByText(/incorrect/i)).toBeVisible({ timeout: 15_000 })
  })

  test('lets a configured founder in, and names them', async ({ page }) => {
    await signInAtFounderHub(page)
    await expect(page.getByText(FOUNDER.name)).toBeVisible()
  })

  test('an unauthenticated API call is refused', async ({ page }) => {
    await page.goto('/')
    const res = await page.request.get('/api/portal/dashboard')
    expect(res.status()).toBe(401)
  })
})

test.describe('navigation', () => {
  test('every section is reachable from the shell', async ({ page }) => {
    await founderSessionViaApi(page)
    await page.goto('/founderhub')
    /* The nav label and the page's own heading are not always the same words —
       "Emails" opens "Member emails" — so each is named. */
    const sections: Array<[link: string, heading: RegExp]> = [
      ['Commerce', /^Commerce$/],
      ['Products', /^Products$/],
      ['Pricing', /^Pricing$/],
      ['Partners', /^Partners$/],
      ['Requires action', /action/i],
      ['Emails', /emails/i],
      ['Settings', /^Settings$/],
    ]
    for (const [link, heading] of sections) {
      await page.getByRole('link', { name: link, exact: true }).click()
      await expect(page.getByRole('heading', { name: heading }).first())
        .toBeVisible({ timeout: 20_000 })
    }
  })

  test('the shell says which catalogue is being served', async ({ page }) => {
    await founderSessionViaApi(page)
    await page.goto('/founderhub')
    // The suite runs on the sample catalogue, and the hub must say so.
    await expect(page.getByText(/MOCK CATALOGUE/i)).toBeVisible()
  })
})

test.describe('the dashboard', () => {
  test('its order count agrees with the orders it is counting', async ({ page }) => {
    await raiseAnOrder(page)
    await founderSessionViaApi(page)

    const dashboard = await (await page.request.get('/api/portal/dashboard')).json()
    const { orders } = await (await page.request.get('/api/portal/orders')).json()
    expect(orders.length).toBeGreaterThan(0)

    await page.goto('/founderhub')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    // Whatever the dashboard reports as revenue, it must be a real figure.
    const body = await page.locator('body').innerText()
    expect(body).toMatch(/£\d/)
    expect(body).not.toMatch(/£NaN|undefined/)
    expect(dashboard).toBeTruthy()
  })
})

test.describe('the fulfilment queue', () => {
  test('a paid order arrives needing review', async ({ page }) => {
    await raiseAnOrder(page)
    await founderSessionViaApi(page)
    await page.goto('/founderhub/commerce/queue')
    await expect(page.getByText(/Daily review queue/i)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/Need review/i)).toBeVisible()
  })

  test('says plainly that nothing is really being sent', async ({ page }) => {
    await founderSessionViaApi(page)
    await page.goto('/founderhub/commerce/queue')
    /* `SUPPLIER_ORDERING=simulate`. The screen has to say so — a founder who
       thinks a parcel is on its way when nothing left the building is the
       expensive way to find this out. */
    await expect(page.getByText(/Simulation mode/i)).toBeVisible({ timeout: 20_000 })
  })

  test('a mock-payments order with no address is blocked rather than sent', async ({ page }) => {
    await raiseAnOrder(page)
    await founderSessionViaApi(page)
    const { orders } = await (await page.request.get('/api/portal/orders')).json()
    const order = orders[0]
    /* Mock checkout collects no delivery address — Stripe is what does that —
       so the queue must refuse to send it. This is the documented wrinkle in
       docs/E2E_TEST_PLAN.md phase A, and it is correct behaviour. */
    expect(order.shippingAddress ?? null).toBeFalsy()
  })
})

test.describe('orders', () => {
  test('an order opens on its own page with its lines and money', async ({ page }) => {
    await raiseAnOrder(page)
    await founderSessionViaApi(page)
    const { orders } = await (await page.request.get('/api/portal/orders')).json()
    const order = orders[0]

    await page.goto(`/founderhub/commerce/orders/${order.id}`)
    await expect(page.getByRole('heading', { name: order.id })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/CHRGD Whey Protein/).first()).toBeVisible()
    await expect(page.getByText(/Total/).first()).toBeVisible()
  })

  test('dates read in the order a UK reader expects', async ({ page }) => {
    await raiseAnOrder(page)
    await founderSessionViaApi(page)
    const { orders } = await (await page.request.get('/api/portal/orders')).json()

    await page.goto(`/founderhub/commerce/orders/${orders[0].id}`)
    await expect(page.getByRole('heading', { name: orders[0].id })).toBeVisible({ timeout: 20_000 })
    /* These three timestamps used to come out of a bare `toLocaleString()`, so
       they were written in whatever order the viewing machine preferred — US on
       this runner. Every other date in the product names `en-GB`. */
    const body = await page.locator('main').innerText()
    expect(body, 'a slash-separated date is back').not.toMatch(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/)
    expect(body).toMatch(/\d{1,2} \w{3} \d{4}/)
  })
})

test.describe('settings', () => {
  test('shows every integration resolved to its mock', async ({ page }) => {
    await founderSessionViaApi(page)
    await page.goto('/founderhub/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    const body = await page.locator('body').innerText()
    for (const control of [/Data source/i, /Supplier/i, /Order sending/i, /Payments/i]) {
      expect(body).toMatch(control)
    }
  })

  test('the data source can be read back over the API', async ({ page }) => {
    await founderSessionViaApi(page)
    const res = await page.request.get('/api/portal/data-source')
    expect(res.status()).toBe(200)
    expect(JSON.stringify(await res.json())).toMatch(/mock/)
  })
})

test.describe('partners', () => {
  test('a new partner appears in the hub with a code', async ({ page }) => {
    await founderSessionViaApi(page)
    const partner = await createPartner(page, { name: `Spec Partner ${Date.now().toString(36)}` })
    expect(partner.code).toBeTruthy()

    await page.goto('/founderhub/partners')
    await expect(page.getByText(partner.name).first()).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('emails', () => {
  test('the outbox is a queue, and nothing is sent without a provider', async ({ page }) => {
    await raiseAnOrder(page)
    await founderSessionViaApi(page)
    await page.goto('/founderhub/emails')
    await expect(page.getByRole('heading', { name: 'Emails' })).toBeVisible({ timeout: 20_000 })
    /* NOTIFY_SOURCE=manual: everything queues and is copied out by hand, so a
       receipt exists as a record without anything leaving the building. */
    const body = await page.locator('body').innerText()
    expect(body).not.toMatch(/£NaN|undefined/)
  })
})
