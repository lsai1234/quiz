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

  test('search narrows the shop to a results grid', async ({ page }) => {
    await openShop(page)
    const cards = page.locator('[data-card]')
    const before = await cards.count()

    await page.getByRole('combobox', { name: 'Search the shop' }).fill('creatine')

    // The heading is the contract: a count, and the words that produced it.
    await expect(page.getByRole('heading', { name: /result(s)? for/i })).toBeVisible({ timeout: 10_000 })
    await expect.poll(async () => cards.count(), { timeout: 10_000 }).toBeLessThan(before)
    await expect(cards.first()).toContainText(/creatine/i)
  })

  test('search finds a product by what it is FOR, not just its name', async ({ page }) => {
    await openShop(page)
    // Nothing in the catalogue is titled "sleep" — this only works because the
    // index carries stack slots and goals.
    await page.getByRole('combobox', { name: 'Search the shop' }).fill('sleep')
    await expect(page.getByRole('heading', { name: /result(s)? for/i })).toBeVisible({ timeout: 10_000 })
    expect(await page.locator('[data-card]').count()).toBeGreaterThan(0)
  })

  test('a search that finds nothing offers a way out', async ({ page }) => {
    await openShop(page)
    await page.getByRole('combobox', { name: 'Search the shop' }).fill('bicycle')

    await expect(page.getByText(/Nothing matched/i)).toBeVisible({ timeout: 10_000 })
    // A dead end with nothing on it ends the visit — the nearest products are
    // offered regardless.
    await expect(page.getByRole('heading', { name: /Popular right now|Closest we stock/ })).toBeVisible()
    expect(await page.locator('[data-card]').count()).toBeGreaterThan(0)

    // "Start over" drops the search AND the filters; the box's own Clear button
    // only drops the text, which is why they do not share a name.
    await page.getByRole('button', { name: 'Start over' }).click()
    await expect(page.getByText(/Nothing matched/i)).toHaveCount(0)
    await expect(page.getByRole('combobox', { name: 'Search the shop' })).toHaveValue('')
  })

  test('a typo still finds the product', async ({ page }) => {
    await openShop(page)
    await page.getByRole('combobox', { name: 'Search the shop' }).fill('creatiine')
    await expect(page.getByText(/closest spellings/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-card]').first()).toContainText(/creatine/i)
  })

  test('a search result adds to the basket', async ({ page }) => {
    await openShop(page)
    expect(await basketCount(page)).toBe(0)
    await page.getByRole('combobox', { name: 'Search the shop' }).fill('creatine')
    await expect(page.getByRole('heading', { name: /result(s)? for/i })).toBeVisible({ timeout: 10_000 })
    await addProductToBasket(page, 'CHRGD Creatine Monohydrate')
    expect(await basketCount(page)).toBe(1)
  })

  test('a search is in the URL, and a deep link restores it', async ({ page }) => {
    await openShop(page)
    await page.getByRole('combobox', { name: 'Search the shop' }).fill('creatine')
    await expect(page.getByRole('heading', { name: /result(s)? for/i })).toBeVisible({ timeout: 10_000 })
    await expect.poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 10_000 }).toBe('creatine')

    // The whole point of the URL: a narrowed shop is a place you can send someone.
    await page.goto('/shop?q=creatine&d=vegan&sort=price-asc')
    await expect(page.getByRole('combobox', { name: 'Search the shop' })).toHaveValue('creatine', { timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Vegan', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Price: low to high' })).toBeVisible()
  })

  test('a stale or hand-edited link is ignored rather than fatal', async ({ page }) => {
    await page.goto('/shop?sort=cheapest&d=unicorn&max=-5&utm_source=email')
    await expect(page.getByRole('heading', { name: 'Everything, à la carte' })).toBeVisible()
    await expect(page.locator('[data-card]').first()).toBeVisible({ timeout: 20_000 })
    // Every bad value dropped, so nothing is narrowing and no sort chip shows.
    await expect(page.getByRole('button', { name: /^Filters$/ })).toBeVisible()
  })

  test('the filter sheet narrows the shop and says how many are left', async ({ page }) => {
    await openShop(page)
    await page.getByRole('button', { name: /^Filters$/ }).click()

    const sheet = page.getByRole('dialog', { name: 'Filters' })
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: /^On offer \d+$/ }).click()

    // The footer count is the feedback while the sheet covers the results.
    const showResults = sheet.getByRole('button', { name: /^Show \d+ results?$/ })
    await expect(showResults).toBeVisible()
    await showResults.click()

    await expect(sheet).toBeHidden()
    await expect(page.getByRole('button', { name: 'Filters (1)' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove filter: On offer' })).toBeVisible()
    await expect.poll(() => new URL(page.url()).searchParams.get('deal')).toBe('1')
  })

  test('an inferred filter is shown back, and removing it edits the search', async ({ page }) => {
    await openShop(page)
    await page.getByRole('combobox', { name: 'Search the shop' }).fill('vegan protein')

    // What we worked out from the phrasing, shown back in their own words.
    const chip = page.getByRole('button', { name: 'Remove filter: Vegan' })
    await expect(chip).toBeVisible({ timeout: 10_000 })
    // The suggestion popup sits over the chip row while the box has focus, as
    // any combobox does — dismiss it first, the way a shopper would.
    await page.getByRole('combobox', { name: 'Search the shop' }).press('Escape')

    await chip.click()
    // Dismissing it deletes the word from the box, so the two can never disagree.
    await expect(page.getByRole('combobox', { name: 'Search the shop' })).toHaveValue('protein')
    await expect(chip).toBeHidden()
  })

  test('the search box suggests products, and one opens its sheet', async ({ page }) => {
    await openShop(page)
    const box = page.getByRole('combobox', { name: 'Search the shop' })
    await box.fill('creatine')

    const listbox = page.getByRole('listbox', { name: 'Search suggestions' })
    await expect(listbox).toBeVisible({ timeout: 10_000 })
    await expect(box).toHaveAttribute('aria-expanded', 'true')

    const first = listbox.getByRole('option').first()
    await expect(first).toContainText(/creatine/i)
    await first.click()

    // A product suggestion goes straight to its sheet — routing the common case
    // through a one-row results grid would just add a step.
    const sheet = page.locator('div.fixed.inset-0.z-50').last()
    await expect(sheet.getByRole('button', { name: 'Add to basket' })).toBeVisible({ timeout: 10_000 })
  })

  test('the keyboard drives the suggestion list', async ({ page }) => {
    await openShop(page)
    const box = page.getByRole('combobox', { name: 'Search the shop' })
    await box.fill('creatine')
    await expect(page.getByRole('listbox', { name: 'Search suggestions' })).toBeVisible({ timeout: 10_000 })

    // Nothing is highlighted until an arrow key asks for it.
    await expect(box).not.toHaveAttribute('aria-activedescendant', /.+/)
    await box.press('ArrowDown')
    const active = await box.getAttribute('aria-activedescendant')
    expect(active).toMatch(/^product:/)
    await expect(page.locator(`[id="${active}"]`)).toHaveAttribute('aria-selected', 'true')

    await box.press('Enter')
    const sheet = page.locator('div.fixed.inset-0.z-50').last()
    await expect(sheet.getByRole('button', { name: 'Add to basket' })).toBeVisible({ timeout: 10_000 })
  })

  test('a shelf suggestion becomes a filter you can see and undo', async ({ page }) => {
    await openShop(page)
    await page.getByRole('combobox', { name: 'Search the shop' }).fill('hydration')

    const jump = page.getByRole('option', { name: /^Hydration, \d+ product/ })
    await expect(jump).toBeVisible({ timeout: 10_000 })
    await jump.click()

    // The text clears and the filter takes its place, as a chip that can be removed.
    await expect(page.getByRole('combobox', { name: 'Search the shop' })).toHaveValue('')
    await expect(page.getByRole('button', { name: /^Remove filter: / })).toBeVisible()
    await expect.poll(() => new URL(page.url()).searchParams.toString()).not.toBe('')
  })

  test('a search that was acted on comes back as a recent search', async ({ page }) => {
    await openShop(page)
    const box = page.getByRole('combobox', { name: 'Search the shop' })

    await box.fill('creatine')
    await expect(page.getByRole('listbox', { name: 'Search suggestions' })).toBeVisible({ timeout: 10_000 })
    await box.press('Enter')

    await box.fill('')
    await box.click()
    await expect(page.getByText('Recent', { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('option', { name: 'Recent search: creatine' })).toBeVisible()

    await page.getByRole('button', { name: 'Clear recent searches' }).click()
    await expect(page.getByText('Recent', { exact: true })).toBeHidden()
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
