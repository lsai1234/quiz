import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { founderSessionViaApi } from '../support/accounts'

/**
 * Test views (Founders Hub → Settings → Test views): a founder opens screens
 * with sample data. Each opens with the test-view banner, sample members land
 * in their hub state, and leaving puts the browser back on the live site.
 * Set TEST_VIEW_SHOTS to keep screenshots.
 */
test.setTimeout(240_000)
const SHOTS = process.env.TEST_VIEW_SHOTS

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}

test('a founder opens test views and leaves', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await founderSessionViaApi(page)

  await page.goto('/founderhub/settings/test-views')
  await expect(page.locator('[data-test-views]')).toBeVisible()
  await expect(page.locator('[data-test-view="hub-day10"]')).toBeVisible()
  await shot(page, 'settings')

  // A sample member: a one-off buyer ten days in, with the banner.
  await page.goto('/api/portal/test-views/open?view=hub-day10')
  await expect(page).toHaveURL(/\/myhub$/)
  await expect(page.locator('[data-test-view-banner]')).toContainText('Test view · sample data')
  await expect(page.locator('[data-hub-hero]')).toContainText('80 days left')
  await shot(page, 'hub-day10')

  // A monthly subscriber.
  await page.goto('/api/portal/test-views/open?view=hub-monthly')
  await expect(page.locator('[data-hub-hero]')).toContainText('Monthly member')

  // A sample person's results page, built in the tab.
  await page.goto('/api/portal/test-views/open?view=results-gym')
  await expect(page.getByRole('heading', { name: /here[’']s your stack/i })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-test-view-banner]')).toBeVisible()
  await shot(page, 'results-gym')

  // The trainer inbox with sample members in place of real ones.
  await page.goto('/api/portal/test-views/open?view=trainer-waiting')
  await page.goto('/founderhub/trainer?samples=1')
  await expect(page.locator('[data-trainer-inbox]')).toContainText('Sample members')

  // Every email, drawn and never sent.
  await page.goto('/founderhub/settings/test-views/emails')
  await expect(page.locator('[data-test-email="order-confirmation"]')).toBeVisible({ timeout: 30_000 })
  expect(await page.locator('[data-test-email]').count()).toBeGreaterThanOrEqual(20)
  await shot(page, 'emails')

  // Leaving: the banner goes, and the hub no longer has the sample member.
  await page.locator('[data-test-view-banner] button').click()
  await expect(page).toHaveURL(/\/founderhub\/settings\/test-views/)
  await expect(page.locator('[data-test-view-banner]')).toHaveCount(0)
  const me = await page.request.get('/api/auth/me')
  const body = (await me.json().catch(() => ({}))) as { user?: { email?: string } | null }
  expect(body.user?.email ?? '').not.toContain('sample.chrgd.test')
})

test('workout mode: a set at a time, rest, how it felt, and the trainer one tap away', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await founderSessionViaApi(page)
  await page.goto('/api/portal/test-views/open?view=training-workout')
  const workout = page.locator('[data-workout]')
  await expect(workout).toBeVisible({ timeout: 30_000 })
  if ((await workout.getAttribute('data-workout-phase')) === 'warmup') await page.locator('[data-workout-warmup-done]').click()
  await expect(page.locator('[data-workout-target]')).toContainText('Set 1 of')
  await expect(page.locator('[data-workout-ask]')).toBeVisible()
  await shot(page, 'workout-set')

  // Done: the rest ring, then the next set.
  await page.locator('[data-workout-done]').click()
  await expect(page.locator('[data-workout-rest]')).toBeVisible()
  await shot(page, 'workout-rest')
  await page.locator('[data-workout-skip]').click()
  await expect(page.locator('[data-workout-target]')).toContainText('Set 2 of')

  // Through the last set to "How did that feel?".
  for (let i = 0; i < 8; i++) {
    if (await page.locator('[data-workout-felt]').isVisible()) break
    await page.locator('[data-workout-done]').click()
    if (await page.locator('[data-workout-skip]').isVisible()) await page.locator('[data-workout-skip]').click()
  }
  await expect(page.locator('[data-workout-felt]')).toBeVisible()
  await shot(page, 'workout-felt')
  await page.locator('[data-felt="hard"]').click()
  await expect(page.locator('[data-workout-target]')).toContainText('Set 1 of')

  // Leave, and the week remembers how it felt.
  await page.locator('[data-workout-close]').click()
  await expect(workout).toHaveCount(0)
  const state = await (await page.request.get('/api/hub/training')).json()
  expect(Object.values(state.plan.felt ?? {}).flat().some((f) => (f as { felt: string }).felt === 'hard')).toBe(true)
})

test('training emails: off until turned on, and the email previews show both', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await founderSessionViaApi(page)
  await page.goto('/api/portal/test-views/open?view=training-midweek')
  const card = page.locator('[data-training-emails]')
  await expect(card).toBeVisible({ timeout: 30_000 })
  await expect(card).toHaveAttribute('data-training-emails', 'off')
  await card.getByText('On training days').click()
  await expect(card).toHaveAttribute('data-training-emails', 'on')
  const state = await (await page.request.get('/api/hub/training')).json()
  expect(state.plan.reminders).toMatchObject({ days: true })
  await shot(page, 'training-emails')

  await page.goto('/founderhub/settings/test-views/emails')
  await expect(page.locator('[data-test-email="training-day"]')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-test-email="training-recap"]')).toBeVisible()

  // A stop link that isn't real says so, and stops nothing.
  await page.goto('/myhub/training/emails?stop=not-a-real-token-at-all-xx')
  await page.locator('[data-stop]').click()
  await expect(page.locator('[data-stop-training-emails]')).toContainText('doesn’t work any more')
})

test('video phase: a form check and a video note, the About page, the inbox and the results page’s proof', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await founderSessionViaApi(page)

  // The member's side: their clip and the trainer's note both play in place, and they said yes to sharing.
  await page.goto('/api/portal/test-views/open?view=trainer-video')
  await expect(page.locator('[data-trainer-thread]')).toBeVisible({ timeout: 30_000 })
  // Their form check and the trainer's note (and the welcome's, while the sample trainer stands in).
  await expect(page.locator('[data-trainer-thread] [data-clip]').nth(1)).toBeVisible()
  await expect(page.locator('[data-share="yes"]')).toBeVisible()
  await expect(page.locator('[data-form-check="pick"]')).toBeVisible()
  await shot(page, 'trainer-video')

  // The About page, with the sample trainer's intro.
  await page.goto('/myhub/trainer/about')
  await expect(page.locator('[data-trainer-about]')).toBeVisible({ timeout: 30_000 })
  await shot(page, 'trainer-about')

  // The founders' side: the clip, the sort, and the exchange ready to feature.
  await page.goto('/founderhub/trainer?samples=1')
  await page.locator('[data-inbox-row]', { hasText: 'trainer-video@' }).locator('button').click()
  await expect(page.locator('[data-thread-clip]')).toHaveCount(2)
  await expect(page.locator('[data-answer-actions]').first()).toContainText('They said yes to sharing')
  await expect(page.locator('[data-tag-select]').first()).toBeVisible()
  await expect(page.locator('[data-video-note="pick"]')).toBeVisible()
  await shot(page, 'trainer-inbox-video')

  // The results page: workout mode drawn (and the trainer's intro, when one is uploaded).
  await page.goto('/api/portal/test-views/open?view=results-gym')
  await expect(page.locator('[data-hub-preview-trainer]')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('[data-hub-proof-workout]')).toBeVisible({ timeout: 30_000 })
  await page.locator('[data-hub-preview]').scrollIntoViewIfNeeded()
  await shot(page, 'results-proof')
})
