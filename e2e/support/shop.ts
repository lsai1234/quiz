import { expect, type Page } from '@playwright/test'

/**
 * Shop and basket helpers.
 *
 * The shop is a browse route with the basket in a drawer; a product is its own
 * route at `/product/[handle]`. There is no "basket page", so these wrap the
 * gestures that stand in for one.
 */

/** Open the shop and wait for the client-fetched catalogue to arrive. */
export async function openShop(page: Page): Promise<void> {
  await page.goto('/shop')
  await expect(page.getByRole('heading', { name: 'Everything, à la carte' })).toBeVisible()
  /* The shelves arrive from a client fetch behind a skeleton that is itself laid
     out in prices, so waiting for "a £" returns while the placeholder is still
     up and every count comes back zero. A real product card is the signal. */
  await expect(page.locator('[data-card]').first()).toBeVisible({ timeout: 20_000 })
}

/*
 * Products are matched on their name rather than position: the shop's ordering
 * is merchandised and moves with stock and deals.
 */
/**
 * Open a product's page.
 *
 * The bottom sheet this used to open is gone — the shop's detail view is now a
 * real route at `/product/[handle]`, so "open the product" is a navigation.
 * Kept under the old name so every caller reads the same; it returns the page
 * itself rather than a sheet locator.
 */
export async function openProductSheet(page: Page, productName: string) {
  await revealShelves(page, productName)
  const card = page.locator('[data-card]').filter({ hasText: productName }).first()
  await card.scrollIntoViewIfNeeded()
  await card.getByRole('link').first().click()
  await page.waitForURL(/\/product\//, { timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Add to basket' })).toBeVisible({ timeout: 15_000 })
  return page
}

export async function addProductToBasket(page: Page, productName: string): Promise<void> {
  const before = await basketCount(page)
  await openProductSheet(page, productName)
  await page.getByRole('button', { name: 'Add to basket' }).click()
  // The basket's own count is the outcome; the button's "Added" flash is a hint.
  await expect.poll(() => basketCount(page), { timeout: 10_000 }).toBe(before + 1)
  // Back to the shelf, the way a shopper would.
  await page.goBack()
  await expect(page.locator('[data-card]').first()).toBeVisible({ timeout: 20_000 })
}

/**
 * Open the shelves far enough to see a named product.
 *
 * A shelf shows two rows and keeps the rest behind "Show all", so a product
 * past the fourth in its category is not on the page until somebody asks for
 * it — which is exactly what a shopper does, and what a test looking for it by
 * name has to do too. No-ops when the product is already visible.
 */
export async function revealShelves(page: Page, productName: string): Promise<void> {
  const card = page.locator('[data-card]').filter({ hasText: productName })
  if (await card.count()) return

  const more = page.getByRole('button', { name: /^Show all \d+ / })
  for (let i = await more.count(); i > 0; i--) {
    const button = more.first()
    if (!(await button.count())) break
    await button.scrollIntoViewIfNeeded()
    await button.click()
    if (await card.count()) return
  }
}

/** Dismiss whatever sheet is open. */
export async function closeSheet(page: Page): Promise<void> {
  const close = page.getByRole('button', { name: /^Close/ }).first()
  if (await close.count()) {
    await close.click()
    return
  }
  // No named close control — the scrim is the way out.
  await page.keyboard.press('Escape')
}

/** How many items the header says are in the basket. */
export async function basketCount(page: Page): Promise<number> {
  const opener = page.getByRole('button', { name: /^Open basket/ }).or(page.getByRole('link', { name: /^Open basket/ })).first()
  const label = (await opener.getAttribute('aria-label')) ?? ''
  return Number(label.match(/(\d+) item/)?.[1] ?? 0)
}

export async function openBasket(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Open basket/ }).click()
  await expect(page.getByText('Your basket')).toBeVisible()
}
