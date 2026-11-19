import { test, expect } from '@playwright/test'

/**
 * "Not sure where to start?" at the top of the shop: the quiz, shown working,
 * and the finder, whose answers are the shop's own filters.
 *
 * What these hold is the finder's promise: an answer is a filter you can see
 * (in the address, as a chip, in the count) and undo, the count is what the
 * shelves then show, and a shared link opens with the answers already given.
 */

const finder = (page: import('@playwright/test').Page) => page.locator('[data-shop-finder]')

test('the quiz tile goes to the quiz', async ({ page }) => {
  await page.goto('/')
  const tile = page.locator('[data-shop-quiz-tile]')
  await expect(tile.getByRole('heading', { name: 'A stack made for you' })).toBeVisible()
  await tile.getByRole('link', { name: /take the quiz/i }).click()
  await expect(page).toHaveURL(/\/quiz$/)
})

test('answers become filters, the count is the shelves, Show goes to them', async ({ page }) => {
  await page.goto('/')
  const f = finder(page)
  await expect(f.locator('[data-finder-question="goal"]')).toHaveText("What's it for?")

  const muscle = f.locator('[data-finder-option="muscle"]')
  const left = Number(await muscle.locator('.sf-finder-count').textContent())
  await muscle.click()
  await expect(page).toHaveURL(/[?&]g=muscle/)
  // A single answer moves on by itself.
  await expect(f.locator('[data-finder-question="avoid"]')).toBeVisible()

  await f.locator('[data-finder-option="vegan"]').click()
  await expect(page).toHaveURL(/[?&]d=vegan/)

  const show = f.locator('[data-finder-show]')
  await expect(show).toBeVisible()
  // The figure on screen counts down to its value; the settled count is on the button.
  const n = Number(await show.getAttribute('data-count'))
  expect(n).toBeGreaterThan(0)
  expect(n).toBeLessThanOrEqual(left)

  await show.click()
  await expect(page.getByText(new RegExp(`^${n} results?$`))).toBeInViewport()
})

test('removing a chip opens its question again; a shared link opens answered', async ({ page }) => {
  await page.goto('/?g=muscle&d=vegan')
  const f = finder(page)
  // The first two are answered, so it opens on the third.
  await expect(f.locator('[data-finder-question="format"]')).toBeVisible()

  await f.getByRole('button', { name: 'Previous question' }).click()
  await f.getByRole('button', { name: 'Previous question' }).click()
  await expect(f.locator('[data-finder-option="muscle"]')).toHaveAttribute('aria-pressed', 'true')

  // The same answer, removed from the filter bar instead.
  await page.getByRole('button', { name: /^Remove filter: .*muscle/i }).click()
  await expect(page).not.toHaveURL(/g=muscle/)
  await expect(f.locator('[data-finder-option="muscle"]')).toHaveAttribute('aria-pressed', 'false')
})

test('a typed answer fills in what it can and searches the rest', async ({ page }) => {
  await page.goto('/')
  const f = finder(page)
  await f.locator('[data-finder-type]').click()
  await f.getByRole('textbox', { name: /say what you're after/i }).fill('vegan protein under £40')
  await f.getByRole('button', { name: 'Go' }).click()
  await expect(page).toHaveURL(/d=vegan/)
  await expect(page).toHaveURL(/max=40/)
  await expect(page).toHaveURL(/q=protein/)
  await expect(f.locator('mark', { hasText: 'protein' })).toBeVisible()
})
