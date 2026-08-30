import { test, expect } from '@playwright/test'
import {
  acceptHealthDataConsent,
  answerStep,
  currentQuestion,
  declineHealthDataConsent,
  startQuiz,
} from '../support/quiz'

/**
 * The Article 9 gate on the safety screen.
 *
 * This is the one piece of the quiz where "the unit tests pass" is not enough:
 * the promise is that declining means the questions are never asked, and the
 * only way to know that is true is to look at what a browser actually renders.
 */

/** Walk forward until the safety screen is the one on show. */
async function toSafetyScreen(page: import('@playwright/test').Page) {
  await startQuiz(page, 'performance')
  for (let i = 0; i < 10; i++) {
    if (/Anything we should factor in/i.test((await currentQuestion(page)) ?? '')) return
    await answerStep(page)
  }
  throw new Error('never reached the safety screen')
}

test('asks permission before it asks anything about health', async ({ page }) => {
  await toSafetyScreen(page)

  const body = await page.locator('body').innerText()
  expect(body).toContain('Before we ask')

  // The questions themselves are not on screen yet — this is the whole point.
  await expect(page.getByRole('button', { name: 'Pregnant or breastfeeding' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Shellfish allergy' })).toHaveCount(0)
})

test('links to the notice and the privacy page from the gate itself', async ({ page }) => {
  await toSafetyScreen(page)
  await expect(page.getByRole('link', { name: 'The detail' })).toHaveAttribute(
    'href', '/legal/health-data',
  )
  await expect(page.getByRole('link', { name: 'Privacy notice' })).toHaveAttribute(
    'href', '/legal/privacy',
  )
})

test('shows the questions once permission is given', async ({ page }) => {
  await toSafetyScreen(page)
  await acceptHealthDataConsent(page)

  await expect(page.getByRole('button', { name: 'Pregnant or breastfeeding' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'On prescription medication' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Shellfish allergy' })).toBeVisible()
})

test('declining leaves the questions unasked and the quiz still working', async ({ page }) => {
  await toSafetyScreen(page)
  await declineHealthDataConsent(page)

  await expect(page.getByRole('button', { name: 'Pregnant or breastfeeding' })).toHaveCount(0)

  // …and the quiz carries on. "Optional" that dead-ends is not optional.
  const before = await currentQuestion(page)
  await page.getByRole('button', { name: /^Continue/ }).first().click()
  await expect.poll(async () => (await currentQuestion(page)) !== before, { timeout: 10_000 })
    .toBe(true)
})

test('taking the permission back hides the questions again', async ({ page }) => {
  await toSafetyScreen(page)
  await acceptHealthDataConsent(page)
  await expect(page.getByRole('button', { name: 'Pregnant or breastfeeding' })).toBeVisible()

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('button', { name: 'Pregnant or breastfeeding' })).toHaveCount(0)
  await expect(page.getByText('Before we ask')).toBeVisible()
})

test('the two legal pages render', async ({ page }) => {
  await page.goto('/legal/health-data')
  await expect(page.getByText('Using your health answers')).toBeVisible()

  await page.goto('/legal/privacy')
  await expect(page.getByText('Privacy notice').first()).toBeVisible()
  // The parts a notice is useless without.
  const body = await page.locator('body').innerText()
  expect(body).toContain('Your rights')
  expect(body).toContain('How long we keep it')
  expect(body).toContain('Information Commissioner')
})
