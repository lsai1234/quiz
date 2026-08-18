import { expect, type Page } from '@playwright/test'

/**
 * Shop and basket helpers.
 *
 * The shop is a single route with the basket in a drawer and products in a
 * sheet, so "go to the basket page" does not exist — these wrap the gestures
 * that stand in for it.
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

/**
 * Add a named product to the basket through its sheet.
 *
 * Products are matched on their name rather than position: the shop's ordering
 * is merchandised and moves with stock and deals.
 */
export async function openProductSheet(page: Page, productName: string) {
  const card = page.locator('[data-card]').filter({ hasText: productName }).first()
  await card.scrollIntoViewIfNeeded()
  await card.getByRole('button').first().click()
  /* Every card carries its own quick-add button, so "Add to basket" matches ~69
     elements on this page and has to be scoped to the sheet.
     NOTE: the sheet is a bare `fixed inset-0` div — it carries no `role="dialog"`
     and no accessible name, unlike `@/components/ui/Sheet`, so there is no role
     to select it by. Reported in docs/E2E_AUTOMATED_PLAN.md; swap this for
     `getByRole('dialog')` once it is fixed.
     Scoped on the overlay itself and not on its text: the add button relabels to
     "Added" for 1.3s after a tap, and a locator filtered on "Add to basket"
     stops matching its own sheet the moment the thing under test happens. */
  const sheet = page.locator('div.fixed.inset-0.z-50').last()
  await expect(sheet.getByRole('button', { name: 'Add to basket' })).toBeVisible({ timeout: 10_000 })
  return sheet
}

export async function addProductToBasket(page: Page, productName: string): Promise<void> {
  const before = await basketCount(page)
  const sheet = await openProductSheet(page, productName)
  await sheet.getByRole('button', { name: 'Add to basket' }).click()
  // The basket's own count is the outcome; the button's "Added" flash is a hint.
  await expect.poll(() => basketCount(page), { timeout: 10_000 }).toBe(before + 1)
  await closeSheet(page)
  await expect(sheet).toBeHidden()
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
  const opener = page.getByRole('button', { name: /^Open basket/ })
  const label = (await opener.getAttribute('aria-label')) ?? ''
  return Number(label.match(/(\d+) item/)?.[1] ?? 0)
}

export async function openBasket(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Open basket/ }).click()
  await expect(page.getByText('Your basket')).toBeVisible()
}
