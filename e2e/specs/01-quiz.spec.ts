import { test, expect } from '@playwright/test'
import { completeQuiz, startQuiz, answerAllQuestions, QUIZ_NAME } from '../support/quiz'

test('performance track: quiz runs start to finish and produces a stack', async ({ page }) => {
  await completeQuiz(page, 'performance')
  await expect(page.getByText('Routine fit')).toBeVisible()
})

test('the review step shows the answers back as labels, not ids', async ({ page }) => {
  await startQuiz(page, 'performance')
  await answerAllQuestions(page)
  const review = await page.locator('body').innerText()
  expect(review).toContain(QUIZ_NAME)
  expect(review).toContain('Under 25')
  expect(review).not.toContain('16-24')
})

test('an edit from the review screen comes back to the review screen', async ({ page }) => {
  // Editing one answer used to drop the reader back into the flow and make
  // them walk forward through every remaining question to reach a screen they
  // had already been on. Changing one answer should cost one answer.
  await startQuiz(page, 'performance')
  await answerAllQuestions(page)
  await expect(page.getByRole('heading', { name: /Quick check before we build/ })).toBeVisible()

  const rows = page.locator('.overflow-y-auto button').filter({ hasText: 'Edit' })
  await rows.nth(1).click()

  // Whichever step it is, answering returns to the review rather than
  // continuing forward through the rest of the quiz.
  const cta = page.getByRole('button', { name: /^(Continue|Save and go back)/ })
  const options = page.locator('.overflow-y-auto button[aria-pressed]')
  if (await cta.count()) {
    if (await options.count()) await options.first().click()
    await page.getByRole('button', { name: /^(Continue|Save and go back)/ }).click()
  } else {
    await options.first().click()
  }
  await expect(page.getByRole('heading', { name: /Quick check before we build/ })).toBeVisible({ timeout: 10_000 })
})
