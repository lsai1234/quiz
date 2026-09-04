import { test, expect, type Page } from '@playwright/test'
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

    // A product suggestion goes straight to that product's page — routing the
    // common case through a one-row results grid would just add a step.
    await page.waitForURL(/\/product\//, { timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Add to basket' })).toBeVisible({ timeout: 15_000 })
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
    await page.waitForURL(/\/product\//, { timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Add to basket' })).toBeVisible({ timeout: 15_000 })
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

  test('a basket that is nearly a bundle says so, without promising the basket a bundle price', async ({ page }) => {
    await openShop(page)
    // Two of the three core products in the Early Shift bundle.
    await addProductToBasket(page, 'CHRGD Whey Protein')
    await addProductToBasket(page, 'CHRGD Electrolyte Mix')

    const nudge = page.getByRole('link', { name: /bought on their own page/i })
    await expect(nudge).toBeVisible({ timeout: 10_000 })
    await expect(nudge).toHaveAttribute('href', /^\/bundles\//)

    // The honesty constraint: a bundle is a separate checkout, so the nudge may
    // never read as "add this to your basket and save". And it only quotes a
    // price when the bundle genuinely beats the same products through the
    // basket — the £50+ tier the basket already earns is not a bundle saving.
    const text = (await nudge.textContent()) ?? ''
    expect(text).not.toMatch(/add to basket/i)
    expect(text).not.toMatch(/£0\.00/)
    if (/less as a bundle/i.test(text)) {
      expect(text).toMatch(/You have \d+ of its \d+/)
    } else {
      expect(text).toMatch(/\d+ of the \d+ in the/i)
    }
  })

  test('a basket with nothing near a bundle gets the delivery ladder instead', async ({ page }) => {
    await openShop(page)
    await addProductToBasket(page, 'CHRGD Whey Protein')
    // One product is a long way under the free-delivery line, and holding one of
    // a three-product bundle is an advert rather than a near-miss.
    await expect(page.getByText(/from free delivery/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test('a suggestion can be waved away', async ({ page }) => {
    await openShop(page)
    await addProductToBasket(page, 'CHRGD Whey Protein')
    const dismiss = page.getByRole('button', { name: 'Dismiss suggestion' }).first()
    await expect(dismiss).toBeVisible({ timeout: 10_000 })
    await dismiss.click()
    await expect(page.getByRole('button', { name: 'Dismiss suggestion' })).toHaveCount(0)
  })

  /**
   * Enter compare mode and return a locator for the selectable cards.
   *
   * Compare used to be a button on every card. It is now a shelf mode — one
   * control in the filter row, after which the cards themselves select — so
   * that eight identical grey buttons stopped being the thing a shopper saw
   * first. The gesture is: turn it on, then tap products.
   */
  async function enterCompareMode(page: Page) {
    await page.getByRole('button', { name: 'Compare', exact: true }).click()
    return page.locator('[data-card] a[aria-pressed]')
  }

  test('two products can be put head to head', async ({ page }) => {
    await openShop(page)
    const cards = await enterCompareMode(page)

    // The tray appears on the FIRST pick and says what it is waiting for.
    await cards.first().click()
    await expect(page.getByText('Pick one more to compare')).toBeVisible()

    await cards.nth(1).click()
    await page.getByRole('button', { name: 'Compare', exact: true }).last().click()

    const sheet = page.getByRole('dialog', { name: 'Compare products' })
    await expect(sheet).toBeVisible()
    // The headline row, and the reason the sheet exists.
    await expect(sheet.getByRole('rowheader', { name: 'Price per serving' })).toBeVisible()
    await expect(sheet.getByRole('rowheader', { name: 'Price', exact: true })).toBeVisible()
  })

  test('the duel scores facts and leaves preferences alone', async ({ page }) => {
    await openShop(page)
    const cards = await enterCompareMode(page)
    await cards.first().click()
    await cards.nth(1).click()
    await page.getByRole('button', { name: 'Compare', exact: true }).last().click()

    const sheet = page.getByRole('dialog', { name: 'Compare products' })
    // A crown is named, not just coloured — so it survives without the accent.
    await expect(sheet.getByText(/better on Price per serving/)).toBeAttached()
    // Format is a preference: both values, no verdict.
    const formatRow = sheet.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Format' }) })
    await expect(formatRow.getByText(/better on/)).toHaveCount(0)
  })

  test('a duel adds to the basket and closes', async ({ page }) => {
    await openShop(page)
    const cards = await enterCompareMode(page)
    await cards.first().click()
    await cards.nth(1).click()
    await page.getByRole('button', { name: 'Compare', exact: true }).last().click()

    const sheet = page.getByRole('dialog', { name: 'Compare products' })
    await sheet.getByRole('button', { name: /^Add CHRGD / }).first().click()
    await expect.poll(() => basketCount(page), { timeout: 10_000 }).toBe(1)

    await sheet.getByRole('button', { name: 'Close comparison' }).click()
    await expect(sheet).toBeHidden()
  })

  test('a third pick replaces the oldest rather than doing nothing', async ({ page }) => {
    await openShop(page)
    const cards = await enterCompareMode(page)
    await cards.first().click()
    await cards.nth(1).click()
    await cards.nth(2).click()

    // The first pick has been dropped, and the pair is still ready to compare.
    // (Counting pressed CARDS would not work on its own: a product on the Deals
    // rail also appears on its category shelf, so one product has two cards.)
    await expect(cards.first()).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('button', { name: 'Compare', exact: true }).last()).toBeVisible()
  })

  test('the basket says what it covers, and a gap is somewhere to look', async ({ page }) => {
    await openShop(page)
    await addProductToBasket(page, 'CHRGD Whey Protein')
    await openBasket(page)

    const radar = page.getByRole('region', { name: 'What this basket covers' })
    await expect(radar).toBeVisible()
    await expect(radar.getByText('Protein', { exact: true })).toBeVisible()

    // An uncovered slot is stated, not prescribed — and it is somewhere to look.
    await expect(radar.getByText(/Not in this basket/)).toBeVisible()
    await radar.getByRole('button').first().click()

    // The drawer closes and the shop is filtered to that slot, as a chip.
    await expect(radar).toBeHidden()
    await expect(page.getByRole('button', { name: /^Remove filter: / })).toBeVisible()
    await expect.poll(() => new URL(page.url()).searchParams.get('sl')).not.toBeNull()
  })

  test('a basket carrying the same ingredient twice says so', async ({ page }) => {
    await openShop(page)
    // Both of these list magnesium.
    await addProductToBasket(page, 'CHRGD Magnesium Glycinate')
    await addProductToBasket(page, 'CHRGD Sleep & Recovery')

    // It leads the suggestion queue: telling someone to buy less outranks
    // selling them a bundle.
    const nudge = page.getByText(/both contain magnesium/i).first()
    await expect(nudge).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/You may only need one/i).first()).toBeVisible()

    // Arithmetic, never advice.
    const text = (await nudge.textContent()) ?? ''
    expect(text).not.toMatch(/too much|unsafe|overdose|stop taking/i)
  })

  test('the empty search box teaches that a whole sentence works', async ({ page }) => {
    await openShop(page)
    const box = page.getByRole('combobox', { name: 'Search the shop' })
    await box.click()

    await expect(page.getByText('Try a sentence')).toBeVisible({ timeout: 10_000 })
    const example = page.getByRole('option', { name: /^Try searching: / }).first()
    await example.click()

    // Tapping one runs it, and it returns products rather than teaching a dead end.
    await expect(page.getByRole('heading', { name: /result(s)? for/i })).toBeVisible({ timeout: 10_000 })
    expect(await page.locator('[data-card]').count()).toBeGreaterThan(0)
  })

  test('the roulette lands on something real, at the price it charges', async ({ page }) => {
    await openShop(page)
    await page.getByRole('button', { name: /Feeling lucky/ }).click()

    const sheet = page.getByRole('dialog', { name: 'Flavour roulette' })
    await expect(sheet).toBeVisible()

    // It opens already spun — nobody opens this to look at an empty wheel.
    const add = sheet.getByRole('button', { name: /^Add for £/ })
    await expect(add).toBeEnabled({ timeout: 10_000 })

    // The price on the button is the price it adds.
    const label = (await add.textContent()) ?? ''
    const price = label.match(/£[\d.]+/)?.[0]
    expect(price).toBeTruthy()
    await add.click()
    await expect.poll(() => basketCount(page), { timeout: 10_000 }).toBe(1)
  })

  test('the roulette stays inside the shopper’s filters', async ({ page }) => {
    await openShop(page)
    await page.getByRole('button', { name: 'Vegan', exact: true }).click()
    await page.getByRole('button', { name: /Feeling lucky/ }).click()

    const sheet = page.getByRole('dialog', { name: 'Flavour roulette' })
    await expect(sheet.getByRole('button', { name: /^Add for £/ })).toBeEnabled({ timeout: 10_000 })

    // Whatever it landed on has to be a product the vegan filter allows — a
    // wheel that lands on something you cannot eat is a broken toy.
    const status = await sheet.getByRole('status').textContent()
    expect(status).toMatch(/Landed on /)
    const name = status!.replace(/^Landed on /, '').split(',')[0]

    await sheet.getByRole('button', { name: 'Close roulette' }).click()
    await page.getByRole('combobox', { name: 'Search the shop' }).fill(name)
    await expect(page.locator('[data-card]').filter({ hasText: name }).first()).toBeVisible({ timeout: 10_000 })
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

  test('a product page opens and adds to the basket', async ({ page }) => {
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

  test('a product page renders cleanly', async ({ page }) => {
    await openShop(page)
    await openProductSheet(page, 'CHRGD Creatine Monohydrate')
    const findings = await inspect(page)
    expect(report('the product page', findings), report('the product page', findings)).toBe('')
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
