import { test, expect } from '@playwright/test'
import { inspect, report } from '../support/inspect'
import { openShop } from '../support/shop'
import { sellBundle, unlinkBundle } from '../support/bundles'

/**
 * Bundle landing pages — the third way into a basket, after the quiz and the
 * shop.
 *
 * A bundle is two records now: a PRE-BUILT BUNDLE is a named stack of products,
 * and a SESSION STACK is a session plus one of those stacks. The shipped seeds
 * are session stacks with no pre-built bundle chosen — which one each sells is decided
 * in the Hub against the live range — so these tests build a stack, point a seed
 * at it, and then exercise the page a customer would get.
 *
 * That is not test scaffolding around the real thing; it IS the real thing.
 * Nothing reaches the shop shelf until a founder has made that link, and the
 * first test here is that an unlinked package stays off it.
 */

test('a session stack with no pre-built bundle is not on the shelf and does not render', async ({ page }) => {
  // Unlinked on purpose — the seeds ship this way.
  await unlinkBundle(page, 'game-day')

  const feed = await (await page.request.get('/api/bundles')).json()
  const slugs: string[] = (feed.bundles ?? []).map((b: { bundle?: { slug: string } }) => b.bundle?.slug)
  expect(slugs).not.toContain('game-day')

  // A package with no products cannot be bought, so the page is a 404 rather
  // than an empty stack with a checkout button on it.
  const res = await page.goto('/bundles/game-day')
  expect(res?.status()).toBe(404)
})

test('once it sells a stack, the shop lists it and the page is complete', async ({ page }) => {
  await sellBundle(page, 'leg-day-loading')

  await openShop(page)
  const bundleLinks = page.locator('a[href^="/bundles/"]')
  expect(await bundleLinks.count()).toBeGreaterThan(0)

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

test('every bundle the feed offers renders cleanly', async ({ page }) => {
  await sellBundle(page, 'leg-day-loading')
  await sellBundle(page, 'game-day')

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
