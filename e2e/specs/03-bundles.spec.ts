import { test, expect } from '@playwright/test'
import { inspect, report } from '../support/inspect'
import { openShop } from '../support/shop'

/**
 * Bundle landing pages — the third way into a basket, after the quiz and the
 * shop. Each one is a curated stack sold as a unit at a discount.
 */

test('the shop lists bundles and each links to its own page', async ({ page }) => {
  await openShop(page)
  const bundleLinks = page.locator('a[href^="/bundles/"]')
  expect(await bundleLinks.count()).toBeGreaterThan(0)
})

test('a bundle page names its contents, its saving and a way to buy', async ({ page }) => {
  await page.goto('/bundles/leg-day-loading')
  await expect(page.getByText('Leg Day Loading').first()).toBeVisible()

  // The three things a bundle page has to answer: what is in it, what it costs,
  // and what the bundle saves against buying the same products separately.
  await expect(page.getByText(/3 products/i).first()).toBeVisible()
  await expect(page.getByText(/£\d+\.\d{2}/).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Checkout|Add|Buy/i }).first()).toBeVisible()
})

test('an unknown bundle slug 404s rather than rendering an empty page', async ({ page }) => {
  const res = await page.goto('/bundles/no-such-bundle-anywhere')
  expect(res?.status()).toBe(404)
})

test('every seeded bundle page renders cleanly', async ({ page }) => {
  /* The feed wraps each entry: `{ bundles: [{ bundle: {slug,…}, pricing }] }`. */
  const feed = await (await page.request.get('/api/bundles')).json()
  const slugs: string[] = (feed.bundles ?? []).map((b: any) => b.bundle?.slug ?? b.slug).filter(Boolean)
  expect(slugs.length, 'no bundles came back from /api/bundles').toBeGreaterThan(0)

  for (const slug of slugs) {
    await page.goto(`/bundles/${slug}`)
    await expect(page.getByText(/£\d+\.\d{2}/).first()).toBeVisible({ timeout: 15_000 })
    const findings = await inspect(page)
    expect(report(`/bundles/${slug}`, findings), report(`/bundles/${slug}`, findings)).toBe('')
  }
})
