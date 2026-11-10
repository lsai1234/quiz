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

test('programmes and goals: the lighter week, a goal, the cool-down, the progress page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await founderSessionViaApi(page)
  await page.goto('/api/portal/test-views/open?view=training-programme')
  await expect(page.locator('[data-programme="lighter"]')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-programme]')).toContainText('Week 4 of 8')
  await expect(page.locator('[data-goal="lift"] [data-milestone-done="true"]').first()).toBeVisible()
  await expect(page.locator('[data-live-qa]')).toBeVisible()
  // A missed session (any day before today): move it, and it says where from.
  const missed = page.locator('[data-missed]')
  if (await missed.count()) {
    const move = missed.locator('[data-missed-move]')
    if (await move.count()) {
      await move.click()
      await expect(page.locator('[data-session-moved]').first()).toBeVisible()
    }
  }
  await shot(page, 'training-programme')

  // A session: the ramp sets before, the cool-down after.
  await page.locator('[data-session-type="strength"] [data-open-session]').first().click()
  await expect(page.locator('[data-cooldown]')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.goto('/myhub/training/progress')
  await expect(page.locator('[data-progress-months]')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-lift-chart]').first()).toBeVisible()
  await expect(page.locator('[data-progress-bests] li').first()).toBeVisible()
  await shot(page, 'training-progress')
})

test('the hero and the gift in a test view, and the sample inbox’s exchange kept out of the real results page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await founderSessionViaApi(page)

  // Both start off; ticking them changes this browser only.
  await page.goto('/founderhub/settings/test-views')
  const hero = page.locator('input[data-test-switch="hero"]')
  const gift = page.locator('input[data-test-switch="gift"]')
  await expect(hero).not.toBeChecked()
  await expect(gift).not.toBeChecked()
  // Each saves before it shows as ticked, so click and wait rather than `check()`.
  await hero.click()
  await expect(hero).toBeChecked()
  await expect(gift).toBeEnabled()
  await gift.click()
  await expect(gift).toBeChecked()

  // A sample results page: sample heroes and a gift pool reach the page, and the gift is on the rewards ladder.
  await page.goto('/api/portal/test-views/open?view=results-gym')
  const offer = ((await (await page.request.get('/api/offer')).json()) as { offer: { heroEnabled: boolean; heroes: object; bonus: { enabled: boolean } } }).offer
  expect(offer.heroEnabled).toBe(true)
  expect(Object.keys(offer.heroes).length).toBeGreaterThan(0)
  expect(offer.bonus.enabled).toBe(true)
  await expect(page.locator('[data-just-one]')).toBeVisible({ timeout: 60_000 })
  // The gift comes once the box can keep the margin floor with it in: turn on what's off until it does.
  const offs = page.locator('[data-box-row] [role="switch"][aria-checked="false"]')
  for (let i = 0; i < 4 && (await page.locator('[data-rung="gift"]').count()) === 0 && (await offs.count()) > 0; i++) {
    await offs.first().click()
    await page.waitForTimeout(300)
  }
  await expect(page.locator('[data-rung="gift"]').first()).toBeAttached({ timeout: 30_000 })
  await shot(page, 'results-hero-gift')

  // The sample inbox: show the shared answer on the results page, in test views only.
  await page.goto('/api/portal/test-views/open?view=trainer-video')
  await page.goto('/founderhub/trainer?samples=1')
  await page.locator('[data-inbox-row]', { hasText: 'trainer-video@' }).locator('button').click()
  const actions = page.locator('[data-answer-actions]').filter({ hasText: 'They said yes to sharing' }).first()
  await actions.locator('[data-feature]').click()
  await actions.locator('[data-save-answer-action]').click()
  await expect(actions).toContainText('On the results page in test views only.')

  // The real inbox's content has no exchange; the test view's results page shows the sample one.
  const live = (await (await page.request.get('/api/portal/trainer/content')).json()) as { featured: unknown }
  expect(live.featured).toBeNull()
  await page.goto('/api/portal/test-views/open?view=results-gym')
  await expect(page.locator('[data-hub-proof-exchange]')).toBeVisible({ timeout: 60_000 })

  // Reset sample data takes it away.
  await page.request.delete('/api/portal/test-views')
  const sample = (await (await page.request.get('/api/portal/trainer/content?samples=1')).json()) as { featured: unknown }
  expect(sample.featured).toBeNull()
})
