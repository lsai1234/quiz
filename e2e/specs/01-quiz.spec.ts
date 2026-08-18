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
