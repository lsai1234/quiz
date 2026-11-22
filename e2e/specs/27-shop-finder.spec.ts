import { test, expect } from '@playwright/test'

/**
 * The top of the shop: the quiz strip, shown working, and the finder, whose
 * answers are the shop's own filters.
 *
 * What these hold is the finder's promise: an answer is a filter you can see
 * (in the address, as a chip, in the count) and undo, the count is what the
 * shelves then show, and a shared link opens with the answers already given.
 */

const finder = (page: import('@playwright/test').Page) => page.locator('[data-shop-finder]')

/** The finder is folded to one bar until it is opened. */
async function openFinder(page: import('@playwright/test').Page) {
  const f = finder(page)
  await f.getByRole('button', { name: /find your match/i }).click()
  await expect(f.getByRole('button', { name: /find your match/i })).toHaveAttribute('aria-expanded', 'true')
  return f
}

test('the quiz strip at the top of the shop goes to the quiz', async ({ page }) => {
  await page.goto('/')
  const tile = page.locator('[data-shop-quiz-tile]')
  await expect(tile.getByRole('heading', { name: 'A stack built around you' })).toBeVisible()
  await tile.getByRole('link', { name: /take the quiz/i }).click()
  await expect(page).toHaveURL(/\/quiz$/)
})

test('a goal on the quiz strip opens the quiz with it ticked', async ({ page }) => {
  // Still, it rests on the quiz's first question; moving, it plays first.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const tile = page.locator('[data-shop-quiz-tile]')
  await tile.getByRole('link', { name: 'Build muscle' }).click()
  // The goal comes off the address once read, so a refresh doesn't restart the quiz.
  await expect(page).toHaveURL(/\/quiz$/)
  await expect(page.getByRole('button', { name: /build muscle/i })).toHaveAttribute('aria-pressed', 'true')
})

test('the consult is offered beside the goals, and opens from there', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const tile = page.locator('[data-shop-quiz-tile]')
  // The quiz page offers the consult as a third option by default.
  const amp = tile.getByRole('link', { name: 'Or ask Amp' })
  await expect(amp).toBeVisible({ timeout: 20_000 })
  await amp.click()
  await expect(page.locator('.amp-consult')).toBeVisible({ timeout: 30_000 })
  // Read once: the address no longer asks for it.
  await expect(page).toHaveURL(/\/quiz$/)
})

test('the quiz homepage offers the consult as a third way in', async ({ page }) => {
  await page.goto('/quiz')
  await expect(page.getByTestId('enter-consult')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: /Everyday wellness/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Performance \+ wellness/ })).toBeVisible()
})

test('the quiz strip plays once, then rests on the first question', async ({ page }) => {
  await page.goto('/')
  const tile = page.locator('[data-shop-quiz-tile]')
  // Playing: an example is on, and the button stops it.
  await expect(tile.getByRole('button', { name: 'Stop the examples' })).toBeVisible()
  await tile.getByRole('button', { name: 'Stop the examples' }).click()
  await expect(tile.getByRole('link', { name: 'Build muscle' })).toBeVisible()
  await expect(tile.getByRole('button', { name: 'Your first question' })).toHaveAttribute('aria-pressed', 'true')
})

test('answers become filters, the count is the shelves, Show goes to them', async ({ page }) => {
  await page.goto('/')
  const f = await openFinder(page)
  await expect(f.locator('[data-finder-question="goal"]')).toHaveText("What's it for?")

  const muscle = f.locator('[data-finder-option="muscle"]')
  const left = Number(await muscle.locator('.sf-finder-count').textContent())
  // The quick view shows the three goals that cover the most of the shop; the
  // rest are a tap away under "More goals".
  if (!(await muscle.isVisible())) await f.getByRole('button', { name: /more goals/i }).click()
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
  const f = await openFinder(page)
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
  const f = await openFinder(page)
  await f.locator('[data-finder-type]').click()
  await f.getByRole('textbox', { name: /say what you're after/i }).fill('vegan protein under £40')
  await f.getByRole('button', { name: 'Go' }).click()
  await expect(page).toHaveURL(/d=vegan/)
  await expect(page).toHaveURL(/max=40/)
  await expect(page).toHaveURL(/q=protein/)
  await expect(f.locator('mark', { hasText: 'protein' })).toBeVisible()
})
