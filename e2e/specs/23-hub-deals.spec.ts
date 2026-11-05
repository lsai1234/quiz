import path from 'node:path'
import { test, expect, type Locator, type Page } from '@playwright/test'
import { founderSessionViaApi, signUpViaApi } from '../support/accounts'
import { completeQuiz } from '../support/quiz'

/**
 * The hub, sold on the reveal and kept in the hub: with member deals and the
 * training plan switched on, the results page shows a first training week and
 * the member price each product would get; after the order, the hub lists
 * those prices with when each opens. Set TRAINING_SHOTS to keep screenshots.
 */
test.setTimeout(240_000)
const SHOTS = process.env.TRAINING_SHOTS

async function shot(target: Page | Locator, name: string) {
  if (SHOTS) await target.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage()
  await founderSessionViaApi(page)
  await page.request.post('/api/portal/offer', { data: { services: { training: false, deals: false } } })
  await page.close()
})

test('the reveal shows the hub; the hub keeps the member prices', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await founderSessionViaApi(page)
  expect((await page.request.post('/api/portal/offer', { data: { services: { training: true, deals: true } } })).status()).toBe(200)

  await signUpViaApi(page)
  await completeQuiz(page)
  const box = page.locator('[data-box]')
  await box.getByRole('radio', { name: /Just this once/ }).click()
  const preview = box.locator('[data-hub-preview]')
  await expect(preview).toBeVisible({ timeout: 20_000 })
  await expect(preview.locator('[data-hub-preview-training] li').first()).toBeVisible()
  await expect(preview.locator('[data-hub-preview-deals] li').first()).toBeVisible()
  await expect(box.locator('[data-box-services] [data-service="deals"]')).toBeVisible()
  await preview.scrollIntoViewIfNeeded()
  await shot(preview, '8-reveal-hub')

  // Monthly: the plan ships its products at the monthly price, so no member prices for them.
  const monthly = box.getByRole('radio', { name: /Keep me stocked/ })
  if (await monthly.isEnabled()) {
    await monthly.click()
    await expect(preview.locator('[data-hub-preview-deals]')).toBeHidden()
    await box.getByRole('radio', { name: /Just this once/ }).click()
    await expect(preview.locator('[data-hub-preview-deals]')).toBeVisible()
  }

  await box.locator('[data-box-cta]').click()
  await expect(page.locator('[data-guide-link]')).toBeVisible({ timeout: 30_000 })

  await page.goto('/myhub')
  const deals = page.locator('[data-deals]')
  await expect(deals).toBeVisible({ timeout: 20_000 })
  // Just bought: each opens when it's due to run out.
  await expect(deals.locator('[data-deal-state="upcoming"]').first()).toBeVisible()
  await expect(deals.getByText(/^Opens in \d+ days/).first()).toBeVisible()
  await deals.scrollIntoViewIfNeeded()
  await shot(deals, '9-hub-deals')
})
