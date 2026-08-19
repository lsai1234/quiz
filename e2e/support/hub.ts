import { expect, type Page } from '@playwright/test'
import { signUpViaApi } from './accounts'

/**
 * My Hub helpers for the plan-change journeys.
 *
 * The change flows are sheets over the dashboard with no URL of their own, and
 * each one is several steps: a reason, a choice, then a confirmation carrying
 * the money. These wrap the walk so the specs can be about the figures.
 */

/** A signed-in member on the dashboard, past the re-consent notice. */
export async function openHub(page: Page) {
  const who = await signUpViaApi(page)
  await page.goto('/myhub')
  await expect(page.getByText('YOUR SUBSCRIPTION')).toBeVisible({ timeout: 20_000 })
  const notNow = page.getByRole('button', { name: /Not now/ })
  if (await notNow.count()) await notNow.click()
  return who
}

/** The plan as the server holds it — the thing a member is actually billed on. */
export async function storedPlan(page: Page) {
  const res = await page.request.get('/api/hub/subscription')
  expect(res.status()).toBe(200)
  return (await res.json()).subscription as {
    flatMonthly: number
    subscriptionDiscountRate: number
    lines: Array<{
      id: string
      productId: string
      productTitle: string
      quantity: number
      deliveryIntervalMonths: number
      pricePerDelivery: number
      pendingCredit?: number
      deliveriesMade: number
      nextShipAt?: string
    }>
  }
}

export async function putPlan(page: Page, subscription: unknown) {
  return page.request.put('/api/hub/subscription', { data: { subscription } })
}

/** Open the swap flow on the first line and get as far as the alternatives. */
export async function openSwapAlternatives(page: Page) {
  await page.getByRole('button', { name: 'Swap' }).first().click()
  await page.getByRole('button', { name: /Just exploring options/ }).click()
  const alternatives = page.getByRole('button').filter({ hasText: /\/mo/ })
  await expect(alternatives.first()).toBeVisible({ timeout: 15_000 })
  return alternatives
}

/** Read "Monthly £53.25 → £48.99" off a confirmation screen. */
export function monthlyTransition(body: string): { from: number; to: number } | null {
  const m = body.match(/Monthly\s*£(\d+\.\d{2})\s*→\s*£(\d+\.\d{2})/)
  return m ? { from: Number(m[1]), to: Number(m[2]) } : null
}
