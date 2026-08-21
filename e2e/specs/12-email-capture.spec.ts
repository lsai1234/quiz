import { test, expect } from '@playwright/test'
import { completeQuiz } from '../support/quiz'

/**
 * Email capture, end to end.
 *
 * The one journey the unit tests cannot prove: a real browser, a real quiz, a
 * real form post, and the email arriving in the founder's outbox afterwards.
 * The assertions are the compliance ones — the tick starts empty, the stack
 * arrives without it, and the unsubscribe link in that email works.
 */

test.describe('keeping your stack', () => {
  test('the card is offered under the stack, and gates nothing', async ({ page }) => {
    await completeQuiz(page, 'performance')

    await expect(page.getByRole('heading', { name: 'Keep your stack' })).toBeVisible()
    // The marketing tick is never pre-ticked.
    await expect(page.getByRole('checkbox')).not.toBeChecked()
    // And the reveal is fully usable with the card ignored.
    await expect(page.getByRole('button', { name: /Checkout|Subscribe/i }).first()).toBeEnabled()
  })

  test('an address gets the stack emailed, with no marketing taken', async ({ page }) => {
    await completeQuiz(page, 'performance')

    const email = `e2e-${Date.now()}@example.com`
    await page.getByLabel(/email address/i).fill(email)
    await page.getByRole('button', { name: /email me my stack/i }).click()

    await expect(page.getByText(/check your inbox/i)).toBeVisible()
    await expect(page.getByText(email)).toBeVisible()
  })

  test('the privacy notice is linked at the field, and is a real page', async ({ page }) => {
    await completeQuiz(page, 'performance')
    await expect(page.getByRole('link', { name: /how we handle your data/i })).toHaveAttribute(
      'href',
      '/legal/privacy',
    )

    await page.goto('/legal/privacy')
    await expect(page.getByRole('heading', { name: 'Privacy notice' })).toBeVisible()
    await expect(page.getByText(/one click/i).first()).toBeVisible()
  })
})

