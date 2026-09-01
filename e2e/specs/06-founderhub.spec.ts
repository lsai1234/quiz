import { test, expect } from '@playwright/test'
import { founderSessionViaApi, signInAtFounderHub, createPartner, FOUNDER } from '../support/accounts'
import { openShop, addProductToBasket, openBasket } from '../support/shop'
import { inspect, report } from '../support/inspect'

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
    /* `\w{3,4}`, not `\w{3}`: en-GB abbreviates September to "Sept" and every
       other month to three letters, so a three-letter pattern passed for eleven
       months of the year and failed for the twelfth. It was written in a month
       that was not September. The assertion is about the ORDER — day, then
       month, then year — not about the month's length. */
    expect(body).toMatch(/\d{1,2} \w{3,4} \d{4}/)
  })
})

test.describe('settings', () => {
  /**
   * Settings is an index of topics, each opening its own page — five unrelated
   * subjects that used to be one long scroll where the switch you wanted was
   * always below the fold.
   */
  test('lists every topic, grouped, one tap away', async ({ page }) => {
    await founderSessionViaApi(page)
    await page.goto('/founderhub/settings')
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()

    for (const group of ['Selling', 'Marketing']) {
      await expect(page.getByRole('heading', { name: group, level: 2 })).toBeVisible()
    }
    for (const topic of ['Catalogue', 'Supplier', 'Payments', 'Competition', 'Share cards']) {
      await expect(page.getByRole('link', { name: new RegExp(`^${topic}`) })).toBeVisible()
    }
  })

  test('each topic opens its own page, and offers the way back', async ({ page }) => {
    await founderSessionViaApi(page)

    const topics: Array<[link: string, slug: string, control: RegExp]> = [
      ['Catalogue', 'catalogue', /Mock catalogue/i],
      ['Supplier', 'supplier', /Where we read from/i],
      ['Payments', 'payments', /Mock payments/i],
      ['Competition', 'competition', /competition/i],
      ['Share cards', 'share-cards', /share card/i],
    ]

    for (const [link, slug, control] of topics) {
      await page.goto('/founderhub/settings')
      await page.getByRole('link', { name: new RegExp(`^${link}`) }).click()
      await expect(page).toHaveURL(new RegExp(`/founderhub/settings/${slug}$`))
      await expect(page.getByRole('heading', { name: link, level: 1 })).toBeVisible()
      await expect(page.getByText(control).first()).toBeVisible()

      // The way out, for somebody who arrived by tapping a row.
      await page.getByRole('link', { name: 'Settings', exact: true }).first().click()
      await expect(page).toHaveURL(/\/founderhub\/settings$/)
    }
  })

  test('the switches still resolve to mock, on their own pages', async ({ page }) => {
    await founderSessionViaApi(page)

    await page.goto('/founderhub/settings/supplier')
    await expect(page.getByRole('heading', { name: 'Order sending' })).toBeVisible()
    /* "Now using" is rendered from the toggle's own fetch, so this waits for it
       rather than reading the page once — reading immediately after `goto`
       catches the screen before the state has arrived. */
    await expect(page.getByText(/Now using:/i)).toBeVisible()
    await expect(page.getByText('Mock', { exact: true }).first()).toBeVisible()

    await page.goto('/founderhub/settings/payments')
    await expect(page.getByText(/Mock payments/i).first()).toBeVisible()
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

test.describe('the supplier integration check', () => {
  /**
   * `docs/E2E_TEST_PLAN.md` phase B as a button: every read-only call we make to
   * PowerBody, run one at a time, so a failure names the call. The suite runs on
   * the sample feed, so what is proved here is the panel and the code path —
   * against a real sandbox account the same run answers for the account.
   */
  test('runs every read-only call and reports each separately', async ({ page }) => {
    await founderSessionViaApi(page)
    await page.goto('/founderhub/settings/supplier')
    await expect(page.getByRole('heading', { name: 'Test the integration' })).toBeVisible()

    await page.getByRole('button', { name: /Run the checks/ }).click()

    // Each capability reports on its own row rather than as one verdict.
    for (const title of [
      'Which supplier is being read',
      'Find some SKUs',
      'Fetch full product detail',
      'Look up one product',
      'Read stock and cost',
      'Read orders back',
      'Place a test order',
    ]) {
      // `.first()`: "Place a test order" names both its row in the list and the
      // gated card below it, and this loop is about the list.
      await expect(page.getByText(title, { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    }
  })

  test('says the run proves nothing about PowerBody while on the sample feed', async ({ page }) => {
    await founderSessionViaApi(page)
    await page.goto('/founderhub/settings/supplier')
    await page.getByRole('button', { name: /Run the checks/ }).click()
    await expect(page.getByText(/Switch Supplier to/)).toBeVisible({ timeout: 30_000 })
  })

  test('the read-only run reports the order check as not run', async ({ page }) => {
    await founderSessionViaApi(page)
    await page.goto('/founderhub/settings/supplier')
    await page.getByRole('button', { name: /^Run the checks$/ }).click()

    /* The row in the list is a report, never a control — placing an order has
       its own gated card below, and sending a customer's order belongs to the
       fulfilment queue. */
    const row = page.locator('li').filter({ hasText: 'Place a test order' }).first()
    await expect(row.getByText('Not run').first()).toBeVisible({ timeout: 30_000 })
    await expect(row.getByRole('button')).toHaveCount(0)
  })

  test('the panel renders cleanly', async ({ page }) => {
    await founderSessionViaApi(page)
    await page.goto('/founderhub/settings/supplier')
    await page.getByRole('button', { name: /Run the checks/ }).click()
    await expect(page.getByText('Read orders back', { exact: true })).toBeVisible({ timeout: 30_000 })
    const findings = await inspect(page)
    expect(report('the supplier check', findings), report('the supplier check', findings)).toBe('')
  })

  test('the API refuses anyone who is not a founder', async ({ page }) => {
    await page.goto('/')
    const res = await page.request.post('/api/portal/supplier/diagnostics')
    expect(res.status()).toBe(401)
  })

  test.describe('the test order', () => {
    /**
     * The one call that writes. PowerBody's API has no field saying "this is a
     * sandbox" — their guide describes DEMO as a state they put an account in —
     * so the gate is a person's confirmation, required per request rather than
     * remembered.
     */
    test('is refused without the sandbox confirmation', async ({ page }) => {
      await founderSessionViaApi(page)
      const res = await page.request.post('/api/portal/supplier/diagnostics', {
        data: { placeTestOrder: true },
      })
      expect(res.status()).toBe(400)
      expect((await res.json()).error).toMatch(/sandbox/i)
    })

    test('is refused when the supplier is the sample feed, confirmed or not', async ({ page }) => {
      await founderSessionViaApi(page)
      const res = await page.request.post('/api/portal/supplier/diagnostics', {
        data: { placeTestOrder: true, confirmSandbox: true },
      })
      // The suite runs on the sample feed, so there is no account to order on.
      expect(res.status()).toBe(400)
      expect((await res.json()).error).toMatch(/sample feed/i)
    })

    test('the read-only run never places one', async ({ page }) => {
      await founderSessionViaApi(page)
      const res = await page.request.post('/api/portal/supplier/diagnostics')
      expect(res.status()).toBe(200)
      const { report } = await res.json()
      expect(report.placedTestOrder).toBe(false)
      expect(report.checks.find((c: { id: string }) => c.id === 'place-order').status).toBe('skip')
    })

    test('the control is explained rather than offered, on the sample feed', async ({ page }) => {
      await founderSessionViaApi(page)
      await page.goto('/founderhub/settings/supplier')
      await page.getByRole('button', { name: /^Run the checks$/ }).click()

      // Explained — and with nothing to order against, not offered.
      await expect(page.getByText(/no account to order against/i)).toBeVisible({ timeout: 30_000 })
      await expect(page.getByRole('checkbox', { name: /DEMO \/ sandbox account/i })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /place a test order/i })).toHaveCount(0)
    })
  })
})
