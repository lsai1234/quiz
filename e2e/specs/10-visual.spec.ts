import { test, expect } from '@playwright/test'
import { founderSessionViaApi, signUpViaApi } from '../support/accounts'
import { openShop } from '../support/shop'

/**
 * Visual regression — the pass that catches what words cannot describe.
 *
 * `09-formatting.spec.ts` asserts things about the rendered page that can be
 * stated: no mojibake, no raw id, no clipped text, no glyph at the wrong size.
 * This one covers everything left over — spacing that drifted, a card that lost
 * its padding, a specular band that stopped lining up with the text — by
 * comparing the pixels against a committed baseline.
 *
 * ## Running it
 *
 * Baselines live in `e2e/snapshots/` and are **platform-specific**: font
 * rasterisation differs between machines, so a baseline taken on a Mac will not
 * match one taken in CI. They are committed for the Linux/Chromium the container
 * runs, and `npm run e2e:update-snapshots` re-takes them. A first run on a new
 * platform writes its own and passes — check the images before committing.
 *
 * ## What is deliberately not screenshotted
 *
 * Anything showing today's date or an order reference. The receipt, the order
 * pages and the delivery calendar all move on their own, and a suite that goes
 * red every morning is a suite people turn off. Those screens are covered by
 * the formatting pass and their journeys instead.
 */

/** Freeze everything that moves, so a diff means a change rather than a frame. */
const STILL = {
  animations: 'disabled' as const,
  caret: 'hide' as const,
  /* The lit ground drifts three blooms on long cycles and lays film grain over
     the top; `animations: disabled` parks them at their first frame, which is
     deterministic. The tolerance below covers font antialiasing only. */
  maxDiffPixelRatio: 0.02,
}

async function settle(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(700)
}

test.describe('the storefront', () => {
  test('the quiz hero', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await settle(page)
    await expect(page).toHaveScreenshot('quiz-hero.png', STILL)
  })

  test('the first question', async ({ page }) => {
    await page.goto('/')
    const entry = page.getByRole('button', { name: /Performance \+ wellness/ })
    await expect(entry).toBeVisible()
    await expect
      .poll(async () => {
        if (await page.locator('h2').count()) return true
        await entry.click({ timeout: 5_000 }).catch(() => {})
        return (await page.locator('h2').count()) > 0
      }, { timeout: 30_000 })
      .toBe(true)
    await settle(page)
    await expect(page).toHaveScreenshot('quiz-first-question.png', STILL)
  })

  test('the shop', async ({ page }) => {
    await openShop(page)
    await settle(page)
    // The shelves are long; the fold is what everyone sees.
    await expect(page).toHaveScreenshot('shop.png', STILL)
  })

  test('a bundle landing page', async ({ page }) => {
    await page.goto('/bundles/leg-day-loading')
    await expect(page.getByText('Leg Day Loading').first()).toBeVisible()
    await settle(page)
    await expect(page).toHaveScreenshot('bundle-leg-day.png', STILL)
  })
})

test.describe('the gates', () => {
  for (const [name, path] of [
    ['my-hub', '/myhub'],
    ['founders-hub', '/founderhub'],
    ['partners-hub', '/partner'],
  ] as const) {
    test(`the ${name} sign-in`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('button', { name: /Sign in/ }).first()).toBeVisible()
      await settle(page)
      await expect(page).toHaveScreenshot(`gate-${name}.png`, STILL)
    })
  }
})

test.describe('the design system', () => {
  /**
   * The styleguide is the one page whose whole job is to show what the
   * primitives look like, so it is the highest-value screenshot in the suite:
   * a regression in `Button`, `Field`, `Badge` or `Modal` shows up here before
   * it shows up on thirty screens that use them.
   */
  test('the styleguide', async ({ page }) => {
    await page.goto('/styleguide')
    await expect(page.getByRole('heading', { name: 'Primitives' })).toBeVisible()
    await settle(page)
    await expect(page).toHaveScreenshot('styleguide.png', { ...STILL, fullPage: true })
  })
})

test.describe('the hubs', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, 'the Founders Hub is a desktop surface')

  test('the founders hub shell', async ({ page }) => {
    await founderSessionViaApi(page)
    await page.goto('/founderhub/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await settle(page)
    /* Settings rather than the dashboard: the dashboard is all live figures and
       would change with every order any other spec raises. */
    await expect(page).toHaveScreenshot('founderhub-settings.png', STILL)
  })
})
