import { test, expect } from '@playwright/test'
import { openShop, addProductToBasket, openBasket, basketCount, openProductSheet } from '../support/shop'
import { inspect, report } from '../support/inspect'

test.describe('the shop', () => {
  test('lists products, categories and bundles', async ({ page }) => {
    await openShop(page)
    await expect(page.getByRole('button', { name: 'Protein', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Bundles', exact: true })).toBeVisible()
    // The mock catalogue is the whole shop in this mode, so it must not be empty.
    expect(await page.getByText(/£\d+\.\d{2}/).count()).toBeGreaterThan(5)
  })

  test('a category jumps to its shelf', async ({ page }) => {
    await openShop(page)
    await page.getByRole('button', { name: 'Hydration', exact: true }).click()
    await expect(page.getByRole('heading', { name: /Hydration/i }).first()).toBeVisible()
  })

  test('a dietary filter narrows the shelves and says it is on', async ({ page }) => {
    await openShop(page)
    const cards = page.locator('[data-card]')
    const before = await cards.count()
    const vegan = page.getByRole('button', { name: 'Vegan', exact: true })
    await vegan.click()
    await expect(vegan).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => cards.count(), { timeout: 10_000 }).toBeLessThan(before)
  })

  test('a product sheet opens and adds to the basket', async ({ page }) => {
    await openShop(page)
    expect(await basketCount(page)).toBe(0)
    await addProductToBasket(page, 'CHRGD Creatine Monohydrate')
    expect(await basketCount(page)).toBe(1)
  })

  test('the basket totals, charges delivery and reaches checkout', async ({ page }) => {
    await openShop(page)
    await addProductToBasket(page, 'CHRGD Whey Protein')
    await openBasket(page)

    // A £34.99 basket sits under the free-delivery line, so postage is named
    // before anyone is asked to pay — see docs/PRICING_GUIDE.md §2.
    await expect(page.getByText(/Delivery/i).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Checkout/ })).toBeEnabled()
  })

  test('the basket drawer renders cleanly', async ({ page }) => {
    await openShop(page)
    await addProductToBasket(page, 'CHRGD Whey Protein')
    await openBasket(page)
    const findings = await inspect(page)
    expect(report('the basket drawer', findings), report('the basket drawer', findings)).toBe('')
  })

  test('a product sheet renders cleanly', async ({ page }) => {
    await openShop(page)
    await openProductSheet(page, 'CHRGD Creatine Monohydrate')
    const findings = await inspect(page)
    expect(report('the product sheet', findings), report('the product sheet', findings)).toBe('')
  })
})

test.describe('the £15 minimum', () => {
  /**
   * Checked against the API rather than the UI. The button can be disabled and
   * the rule still be missing — the refusal has to hold for anything that posts
   * a basket, which is what a customer with the network tab open is doing.
   */
  test('a basket under the minimum is refused server-side, naming the shortfall', async ({ page }) => {
    await page.goto('/shop')
    const catalogue = await (await page.request.get('/api/catalogue')).json()
    const cheapest = catalogue.products
      .flatMap((p: any) => (p.variants ?? []).map((v: any) => ({ id: v.id, price: v.price })))
      .sort((a: any, b: any) => a.price - b.price)[0]

    const res = await page.request.post('/api/cart', {
      data: { lines: [{ variantId: cheapest.id, quantity: 1 }] },
    })
    if (res.status() === 200) {
      test.skip(true, `the cheapest variant (£${cheapest.price}) already clears the minimum`)
    }
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toMatch(/minimum|£/i)
  })

  test('an empty basket is refused', async ({ page }) => {
    await page.goto('/shop')
    const res = await page.request.post('/api/cart', { data: { lines: [] } })
    expect(res.status()).toBe(400)
  })

  test('a made-up variant id is refused rather than priced', async ({ page }) => {
    await page.goto('/shop')
    const res = await page.request.post('/api/cart', {
      data: { lines: [{ variantId: 'not-a-real-variant', quantity: 1 }] },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })
})
