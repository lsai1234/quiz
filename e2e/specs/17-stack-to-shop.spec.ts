import { test, expect } from '@playwright/test'
import { completeQuiz } from '../support/quiz'

/**
 * Leaving a stack to buy its products one at a time.
 *
 * The reveal sells a stack. Some people want two of the five, and until this
 * flow existed their only door was "Swap products" — which still ends in a
 * stack — so they left with nothing.
 *
 * The door is deliberately quiet, and it costs them their code's discount:
 * a partner code works on stacks and subscriptions, not on single products off
 * the shelf. That trade is stated before it is made, and the stack is kept so
 * the decision is reversible. All three of those are what these tests are for —
 * a door that silently cost somebody 25% would be worse than no door.
 */

test('the landing page offers the shop to somebody who does not want a quiz', async ({ page }) => {
  await page.goto('/')
  const link = page.getByRole('link', { name: /browse the whole shop/i })
  await expect(link).toBeVisible()
  await link.click()
  await expect(page).toHaveURL(/\/shop/)
})

test.describe('the door out of a stack', () => {
  test('is offered quietly, states what it costs, and keeps the stack', async ({ page }) => {
    await completeQuiz(page)

    // Quiet: a text link, not a third button competing with the primary CTA.
    const door = page.getByRole('button', { name: /prefer to buy these separately/i })
    await door.scrollIntoViewIfNeeded()
    await expect(door).toBeVisible()

    await door.click()

    // The confirm says what happens to the basket...
    await expect(page.getByText(/in your shop basket/i)).toBeVisible()
    // ...and "Never mind" is offered as the way out of it.
    await expect(page.getByRole('button', { name: /never mind/i })).toBeVisible()

    await page.getByRole('link', { name: /take me to the shop/i }).click()
    await expect(page).toHaveURL(/\/shop/)

    /*
      The stack is not gone. The bar is the promise that the decision is
      reversible — somebody who leaves to look at prices and thinks better of
      it must not have to redo the quiz to get their discount back.
    */
    const bar = page.getByText(/your stack is saved/i)
    await expect(bar).toBeVisible()

    await page.getByRole('link', { name: /back to it/i }).click()
    await expect(page.getByText(/supplement identity/i)).toBeVisible({ timeout: 20_000 })
  })

  test('carries the stack over — and only the stack', async ({ page }) => {
    await completeQuiz(page)

    /*
      The count is the whole point of this test.

      The receipt is handed the WHOLE CATALOGUE as the lookup table its slots
      are resolved against, and the first version of this handoff treated that
      as "the products in this stack". Pressing the button put fifty-three
      items in the basket. It rendered as "We'll put all 53 in your shop
      basket", which is the only reason anybody noticed.

      A stack is a handful of products. Anything past ten is that bug back.
    */
    const offer = page.getByRole('button', { name: /prefer to buy these separately/i })
    await offer.scrollIntoViewIfNeeded()
    await offer.click()

    const sentence = await page.getByText(/in your shop basket/i).innerText()
    const stated = Number(sentence.match(/all (\d+)/)?.[1] ?? '1')
    expect(stated).toBeGreaterThan(0)
    expect(stated).toBeLessThanOrEqual(10)

    await page.getByRole('link', { name: /take me to the shop/i }).click()
    await expect(page).toHaveURL(/\/shop/)

    // What the basket actually holds matches what the sentence promised.
    const basket = page.getByRole('button', { name: /open basket/i })
    await expect(basket).toContainText(String(stated))
  })

  test('the bar goes away once they have gone back, rather than following them around', async ({ page }) => {
    await completeQuiz(page)
    await page.getByRole('button', { name: /prefer to buy these separately/i }).scrollIntoViewIfNeeded()
    await page.getByRole('button', { name: /prefer to buy these separately/i }).click()
    await page.getByRole('link', { name: /take me to the shop/i }).click()

    await page.getByRole('link', { name: /back to it/i }).click()
    await expect(page.getByText(/supplement identity/i)).toBeVisible({ timeout: 20_000 })

    // Back in the shop under their own steam: they are not mid-handoff any
    // more, so the shop should not still be offering to rescue them from one.
    await page.goto('/shop')
    await expect(page.getByText(/your stack is saved/i)).toHaveCount(0)
  })
})
