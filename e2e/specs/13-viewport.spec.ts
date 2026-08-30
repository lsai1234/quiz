import { test, expect, type Page } from '@playwright/test'
import { startQuiz } from '../support/quiz'

/**
 * The Continue button has to be on screen. All of it, on every shell, at every
 * window height.
 *
 * This exists because it once was not: in some in-app webviews and some Android
 * Chrome builds, `100dvh` resolves against the LARGE viewport while the
 * toolbars are still covering the bottom of the screen, so a shell sized to it
 * hangs below the window and takes its pinned CTA with it. The page looks
 * finished and has no way forward — the worst shape a bug can take on a funnel.
 *
 * Chromium here resolves `dvh` correctly, so this cannot reproduce the broken
 * engine. What it can hold is the property that makes the engine's opinion
 * irrelevant: the shell is exactly the height we measured the window to be, the
 * page behind it has nothing to scroll, and the button's bottom edge is inside
 * the window. If any of those three drifts, the fix has been undone.
 */

const HEIGHTS = [844, 620, 500]

async function assertCtaInFrame(page: Page, where: string) {
  const cta = page.getByRole('button', { name: /^(Continue|Pick at least)/ }).last()
  await expect(cta, where).toBeVisible()

  /* `--app-height` is written by a resize listener, so it lands a tick after the
     window actually changes — `setViewportSize` resolves before the page has
     run its handler. Asserting on the first read made this a race that either
     arm could lose depending on which happened to hydrate slower that run.

     Polling costs the test nothing it was actually checking: if the fix is
     undone, the value never reaches the window height and this times out with
     the same message it used to fail with. What it stops doing is failing when
     the value is merely late. */
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const app = getComputedStyle(document.documentElement)
            .getPropertyValue('--app-height').trim()
          return app === `${window.innerHeight}px`
        }),
      { message: `${where}: --app-height tracks the window`, timeout: 5_000 },
    )
    .toBe(true)

  const measured = await page.evaluate(() => ({
    inner: window.innerHeight,
    appHeight: getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim(),
    overhang: document.documentElement.scrollHeight - window.innerHeight,
  }))
  expect(measured.appHeight, `${where}: --app-height tracks the window`).toBe(`${measured.inner}px`)
  // Nothing to scroll means nothing can scroll the shell off the bottom.
  expect(measured.overhang, `${where}: no page scroll behind the shell`).toBeLessThanOrEqual(0)

  const box = (await cta.boundingBox())!
  expect(box.y + box.height, `${where}: the button's bottom edge is in frame`)
    .toBeLessThanOrEqual(measured.inner)
}

test('v1: the CTA stays in frame as the window shrinks', async ({ page }) => {
  await startQuiz(page, 'performance')
  for (const height of HEIGHTS) {
    await page.setViewportSize({ width: 390, height })
    await assertCtaInFrame(page, `v1 @${height}`)
  }
})

test('v2: the CTA stays in frame as the window shrinks', async ({ page }) => {
  await page.goto('/quizv2')
  const track = page.getByRole('button', { name: /Performance \+ wellness/ })
  await expect(track).toBeVisible()
  await expect
    .poll(async () => {
      if (await page.getByRole('button', { name: 'More energy' }).count()) return true
      await track.click({ timeout: 2_000 }).catch(() => {})
      return false
    }, { timeout: 20_000 })
    .toBe(true)
  await page.getByRole('button', { name: 'More energy' }).click()

  for (const height of HEIGHTS) {
    await page.setViewportSize({ width: 390, height })
    await assertCtaInFrame(page, `v2 @${height}`)
  }
})

test('the shell is the right height before React has attached', async ({ page }) => {
  // Hydration on a mid-range phone is seconds, not milliseconds. If the first
  // measurement waited for it, that is how long the button would spend hidden.
  await page.route('**/_next/static/chunks/**', (route) => route.abort())
  await page.setViewportSize({ width: 390, height: 600 })
  await page.goto('/quizv2', { waitUntil: 'domcontentloaded' }).catch(() => {})

  const measured = await page.evaluate(() => ({
    inner: window.innerHeight,
    appHeight: getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim(),
  }))
  expect(measured.appHeight).toBe(`${measured.inner}px`)
})

test('the on-screen keyboard does not collapse the shell', async ({ page }) => {
  // `visualViewport` shrinks when the keyboard opens. Sizing to it would fold
  // the about-you screen into the strip above the keyboard mid-answer, so the
  // measurement deliberately ignores it.
  await page.goto('/quizv2')
  const before = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim())
  await page.evaluate(() => window.visualViewport?.dispatchEvent(new Event('resize')))
  const after = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim())
  expect(after).toBe(before)
})
