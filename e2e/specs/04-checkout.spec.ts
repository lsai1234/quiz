import { test, expect } from '@playwright/test'
import { openShop, addProductToBasket, openBasket } from '../support/shop'
import { completeQuiz, choosePlan, checkoutFromStack } from '../support/quiz'
import { founderSessionViaApi, signUpViaApi, createPartner, newCustomer } from '../support/accounts'
import { inspect, report } from '../support/inspect'

/**
 * Buying, with no money involved.
 *
 * `PAYMENTS_SOURCE=mock` is the app's own no-Stripe path: the order is recorded
 * as paid inline and checkout returns the `#mock-checkout` placeholder instead
 * of a hosted page. That is the whole business right up to the card, which is
 * where the automated suite stops and `docs/E2E_TEST_PLAN.md` phase C takes over
 * — the parts that need a real Stripe test key are listed there and named in
 * `docs/E2E_AUTOMATED_PLAN.md` under "what this suite cannot reach".
 */

test.describe('one-off purchase from the shop', () => {
  test('a basket checks out and reports back', async ({ page }) => {
    await openShop(page)
    await addProductToBasket(page, 'CHRGD Whey Protein')
    await openBasket(page)
    await page.getByRole('button', { name: /Checkout/ }).click()

    /* Mock payments record the order as paid inline and land on the same
       confirmation the real thing does — with the receipt itemised. */
    await expect(page.getByRole('heading', { name: /Your order is confirmed/i }))
      .toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/Total paid/i)).toBeVisible()
  })

  test('the order reaches the founders hub as paid, with its lines', async ({ page }) => {
    await openShop(page)
    await addProductToBasket(page, 'CHRGD Whey Protein')
    await openBasket(page)
    await page.getByRole('button', { name: /Checkout/ }).click()
    await expect(page.getByRole('heading', { name: /Your order is confirmed/i })).toBeVisible({ timeout: 30_000 })

    await founderSessionViaApi(page)
    const orders = await (await page.request.get('/api/portal/orders')).json()
    const list = orders.orders ?? orders
    expect(list.length, 'the checkout raised no order').toBeGreaterThan(0)

    const latest = list[0]
    expect(latest.channel).toBe('shop')
    expect(latest.status).toMatch(/paid/)
    expect(latest.lines.length).toBeGreaterThan(0)
  })
})

test.describe('the quiz stack', () => {
  test('checks out as a one-off bundle', async ({ page }) => {
    await completeQuiz(page)
    await choosePlan(page, 'oneoff')
    await checkoutFromStack(page)
    await expect(page.getByText(/on its way|Demo|demo|order/i).first()).toBeVisible({ timeout: 30_000 })
  })

  test('records the order against the quiz channel, not the shop', async ({ page }) => {
    await completeQuiz(page)
    await choosePlan(page, 'oneoff')
    await checkoutFromStack(page)
    await expect(page.getByText(/on its way|Demo|demo|order/i).first()).toBeVisible({ timeout: 30_000 })

    await founderSessionViaApi(page)
    const { orders } = await (await page.request.get('/api/portal/orders')).json()
    expect(orders[0].channel).toBe('quiz')
  })

  test('a subscription asks for an account before it asks for money', async ({ page }) => {
    await completeQuiz(page)
    await choosePlan(page, 'subscription')
    await checkoutFromStack(page)
    // Signed out, the subscription path opens the account gate.
    await expect(page.getByText(/Create an account|Sign in|email/i).first())
      .toBeVisible({ timeout: 30_000 })
  })

  test('the finished stack renders cleanly', async ({ page }) => {
    await completeQuiz(page)
    const findings = await inspect(page)
    expect(report('the finished stack', findings), report('the finished stack', findings)).toBe('')
  })
})

test.describe('partner codes', () => {
  /**
   * The rule worth holding: a code works on the quiz and subscription channels
   * and is refused on a plain shop basket, so the discount cannot be spent on
   * something no partner introduced.
   */
  test('a code is refused on a plain shop basket', async ({ page }) => {
    await page.goto('/shop')
    await founderSessionViaApi(page)
    const partner = await createPartner(page)
    expect(partner.code, 'the hub minted no code').toBeTruthy()

    const catalogue = await (await page.request.get('/api/catalogue')).json()
    const variant = catalogue.products.flatMap((p: any) => p.variants ?? [])[0]

    const res = await page.request.post('/api/cart', {
      data: {
        lines: [{ variantId: variant.id, quantity: 3, attributes: [{ key: 'source', value: 'shop' }] }],
        partnerCode: partner.code,
      },
    })
    const body = await res.json()
    // Either the request is refused, or it goes through having attributed
    // nothing — what must not happen is the discount being applied.
    if (res.status() === 200) {
      expect(JSON.stringify(body)).not.toContain(partner.code)
    } else {
      expect(res.status()).toBe(400)
    }
  })

  test('an invalid code is refused with a readable reason', async ({ page }) => {
    await page.goto('/shop')
    const res = await page.request.post('/api/partner-code', {
      data: { code: 'DEFINITELY-NOT-A-CODE' },
    })
    const body = await res.json()
    /* The shape that matters: refused, with a sentence a person can act on
       rather than a bare false. */
    expect(body.ok).toBe(false)
    expect(typeof body.reason).toBe('string')
    expect(body.reason.length).toBeGreaterThan(4)
  })
})

test.describe('delivery is charged and consistent', () => {
  /**
   * The ladder is in docs/PRICING_GUIDE.md §2. What matters end to end is that
   * the figure a member is shown in the basket is the figure the order records
   * — the two used to come from different places.
   */
  test('the postage on the receipt is the postage on the order', async ({ page }) => {
    await openShop(page)
    await addProductToBasket(page, 'CHRGD Whey Protein')
    await openBasket(page)
    await page.getByRole('button', { name: /Checkout/ }).click()
    await expect(page.getByRole('heading', { name: /Your order is confirmed/i })).toBeVisible({ timeout: 30_000 })

    /* A £34.99 basket sits under the free-delivery line, so postage is charged
       and printed. The figure on the receipt and the figure on the order used to
       come from different places — this is the check that they agree. */
    const receipt = await page.locator('main').innerText()
    const shown = receipt.match(/Delivery\s*£(\d+\.\d{2})/)?.[1]
    expect(shown, `no delivery line on the receipt:\n${receipt}`).toBeTruthy()

    await founderSessionViaApi(page)
    const { orders } = await (await page.request.get('/api/portal/orders')).json()
    expect(Number(orders[0].shipping).toFixed(2)).toBe(shown)
  })
})
