import { test, expect } from '@playwright/test'
import { signUpViaApi } from '../support/accounts'
import { completeQuiz } from '../support/quiz'

/**
 * Every order gets a stack guide, and Amp checks in on the box (Options 1–3):
 * the box shows their day and what it comes with; ordering links the guide;
 * the guide's page, image and calendar file work; a check-in plays their
 * answers back and offers a reorder without what they've stopped.
 */
test.setTimeout(180_000)

test('the box, the order, the guide, a check-in and a reorder', async ({ page }) => {
  await signUpViaApi(page)
  await completeQuiz(page)

  const box = page.locator('[data-box]')
  await expect(box.locator('[data-your-day]')).toBeVisible()
  await expect(box.locator('[data-box-services] [data-service="guide"][data-unlocked="true"]')).toBeVisible()

  await box.locator('[data-box-cta]').click()
  const link = page.locator('[data-guide-link]')
  await expect(link).toBeVisible({ timeout: 30_000 })
  const href = (await link.getAttribute('href'))!
  expect(href).toMatch(/^\/stack-guide\/[A-Za-z0-9_-]{24}$/)
  const token = href.split('/').pop()!

  await page.goto(href)
  await expect(page.locator('[data-guide]')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('day, charged')

  const image = await page.request.get(`/api/guide/${token}/image`)
  expect(image.status()).toBe(200)
  expect(image.headers()['content-type']).toContain('image/png')
  const ics = await page.request.get(`/api/guide/${token}/calendar`)
  expect(ics.status()).toBe(200)
  expect(await ics.text()).toContain('BEGIN:VEVENT')

  await page.goto(`/checkin/${token}`)
  const products = page.locator('[data-checkin-product]')
  await expect(products.first()).toBeVisible()
  await products.first().getByRole('radio', { name: 'Stopped' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  const drop = page.locator('[data-suggestion="drop"]')
  await expect(drop).toBeVisible()

  await drop.getByRole('link').click()
  await expect(page.locator('[data-reorder-lines]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue to checkout' })).toBeEnabled()

  // A wrong token is a plain "not here", not an error.
  await page.goto('/stack-guide/aaaaaaaaaaaaaaaaaaaaaaaa')
  await expect(page.getByText('This guide isn’t here.')).toBeVisible()
})
