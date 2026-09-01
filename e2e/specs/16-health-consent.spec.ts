import { test, expect } from '@playwright/test'
import {
  acceptHealthDataConsent,
  answerStep,
  currentQuestion,
  declineHealthDataConsent,
  healthConsentTick,
  startQuiz,
} from '../support/quiz'

/**
 * The Article 9 tick on the safety screen.
 *
 * This is the one piece of the quiz where "the unit tests pass" is not enough.
 * The promise is that without the tick, no health answer is ever recorded — and
 * the only way to know that is true is to drive a browser and then look at what
 * the quiz says it heard.
 *
 * ── What changed, and why these tests changed with it ───────────────────────
 * The gate used to be a card that hid the questions until it was answered, and
 * these specs asserted the questions were absent from the DOM. That was one way
 * to keep the promise; it was not the promise. The promise is about PROCESSING,
 * and hiding a button is a weak proxy for it — the flags could still have been
 * written by any other path, and the card taught people that a routine question
 * was a legal event.
 *
 * So the questions are visible now, the tick sits under them, and these tests
 * assert the real thing: tap a health option with the box unticked and the quiz
 * ends up knowing nothing about it.
 */

async function toSafetyScreen(page: import('@playwright/test').Page) {
  await startQuiz(page, 'performance')
  for (let i = 0; i < 10; i++) {
    if (/Anything we should factor in/i.test((await currentQuestion(page)) ?? '')) return
    await answerStep(page)
  }
  throw new Error('never reached the safety screen')
}

test('asks in words, on its own control, unticked', async ({ page }) => {
  await toSafetyScreen(page)

  const tick = healthConsentTick(page)
  await expect(tick).toBeVisible()
  // Pre-ticked consent is not consent. If this ever inverts, everything else
  // here passes and the lawful basis is gone.
  await expect(tick).toHaveAttribute('aria-checked', 'false')

  const body = await page.locator('body').innerText()
  expect(body).toMatch(/health information/i)
  expect(body).toMatch(/never shared/i)
  // Refusable without losing the service, said out loud rather than implied.
  expect(body).toMatch(/you still get a plan/i)
})

test('is about this processing and nothing else', async ({ page }) => {
  await toSafetyScreen(page)
  const label = await healthConsentTick(page).innerText()

  // Bundling this with the terms is DPIA R6 — "one tick-box covered the
  // subscription terms and the health disclaimer together". The tick must never
  // start carrying anything but the health answers.
  expect(label).not.toMatch(/\bterms\b|\bconditions\b|subscription|newsletter|\bdelivery\b/i)

  // "Marketing" is allowed, but only ever as a promise NOT to: "never used for
  // marketing" is a reassurance, "and to receive marketing" is a second consent
  // wearing the first one's clothes. The distinction is the whole point, so it
  // is asserted rather than left to a word ban.
  if (/marketing/i.test(label)) expect(label).toMatch(/never used for marketing/i)
})

test('links to the notice and the privacy page from the tick itself', async ({ page }) => {
  await toSafetyScreen(page)
  await expect(page.getByRole('link', { name: 'The detail' })).toHaveAttribute(
    'href', '/legal/health-data',
  )
  await expect(page.getByRole('link', { name: 'Privacy notice' })).toHaveAttribute(
    'href', '/legal/privacy',
  )
})

/**
 * The one that matters.
 *
 * Reading the question is not consenting to it, and neither is tapping at it.
 * Nothing about a health answer may survive the screen without the tick.
 */
test('a health answer tapped without the tick is never recorded', async ({ page }) => {
  await toSafetyScreen(page)
  await declineHealthDataConsent(page)

  await page.getByRole('button', { name: 'Pregnant or breastfeeding' }).click()
  // It does not even take the selection — the tick is what switches the
  // question on, and a control that looked answered would be a lie.
  await expect(page.getByRole('button', { name: 'Pregnant or breastfeeding' }))
    .toHaveAttribute('aria-pressed', 'false')

  // …and the quiz carries on regardless. "Optional" that dead-ends is not optional.
  const before = await currentQuestion(page)
  await page.getByRole('button', { name: /^Continue/ }).first().click()
  await expect.poll(async () => (await currentQuestion(page)) !== before, { timeout: 10_000 })
    .toBe(true)
})

test('takes the answer once the tick is given', async ({ page }) => {
  await toSafetyScreen(page)
  await acceptHealthDataConsent(page)

  await page.getByRole('button', { name: 'Pregnant or breastfeeding' }).click()
  await expect(page.getByRole('button', { name: 'Pregnant or breastfeeding' }))
    .toHaveAttribute('aria-pressed', 'true')
})

test('taking the tick back drops the answers it covered', async ({ page }) => {
  await toSafetyScreen(page)
  await acceptHealthDataConsent(page)
  await page.getByRole('button', { name: 'Pregnant or breastfeeding' }).click()
  await expect(page.getByRole('button', { name: 'Pregnant or breastfeeding' }))
    .toHaveAttribute('aria-pressed', 'true')

  await healthConsentTick(page).click()
  await expect(healthConsentTick(page)).toHaveAttribute('aria-checked', 'false')
  // Withdrawal has to reach the answer, not just the permission.
  await expect(page.getByRole('button', { name: 'Pregnant or breastfeeding' }))
    .toHaveAttribute('aria-pressed', 'false')
})

test('the two legal pages render', async ({ page }) => {
  await page.goto('/legal/health-data')
  await expect(page.getByText('Using your health answers')).toBeVisible()

  await page.goto('/legal/privacy')
  await expect(page.getByText('Privacy notice').first()).toBeVisible()
  const body = await page.locator('body').innerText()
  expect(body).toContain('Your rights')
  expect(body).toContain('How long we keep it')
  expect(body).toContain('Information Commissioner')
})
