import { test, expect } from '@playwright/test'
import { openHub, storedPlan, putPlan, openSwapAlternatives, monthlyTransition } from '../support/hub'

/**
 * Amending a plan, and what it does to the money coming.
 *
 * Two questions, and they are separate:
 *
 * 1. **Is the member told, and asked?** A change to a recurring charge has to be
 *    quoted before it is made and applied only on a deliberate confirmation.
 * 2. **Does the server agree?** The hub sends a whole `MemberSubscription` back
 *    on save, so every figure in it arrives from the member's own browser. What
 *    they are billed has to be re-derived from what we hold — see
 *    `src/lib/recharge/reprice.ts`, and the unit tests beside it.
 *
 * Stripe itself is mocked (`PAYMENTS_SOURCE=mock`), so what is checked here is
 * the amount the plan carries forward, which is the amount `syncMonthlyAmount`
 * hands to Stripe. The card-side half is `docs/E2E_TEST_PLAN.md` phase C2.
 */

test.describe('swapping a product', () => {
  test('every alternative names what it does to the monthly, before anything is chosen', async ({ page }) => {
    await openHub(page)
    const alternatives = await openSwapAlternatives(page)

    const labels = await alternatives.allInnerTexts()
    expect(labels.length).toBeGreaterThan(1)
    for (const label of labels) {
      // "+£1.69/mo", "−£4.26/mo" — a signed figure, on every option.
      expect(label, `an alternative offered no price effect:\n${label}`).toMatch(/[+−-]£\d+\.\d{2}\/mo/)
    }
  })

  test('the confirmation quotes the old and new monthly, and changes nothing yet', async ({ page }) => {
    await openHub(page)
    const before = await storedPlan(page)

    const alternatives = await openSwapAlternatives(page)
    await alternatives.first().click()
    await expect(page.getByText('Confirm your change')).toBeVisible({ timeout: 15_000 })

    const quoted = monthlyTransition(await page.locator('body').innerText())
    expect(quoted, 'the confirmation did not quote a monthly transition').not.toBeNull()
    expect(quoted!.from).toBeCloseTo(before.flatMonthly, 2)
    expect(quoted!.to).not.toBeCloseTo(before.flatMonthly, 2)

    // Quoted, not applied: a member reading the figure has not yet agreed to it.
    const during = await storedPlan(page)
    expect(during.flatMonthly).toBeCloseTo(before.flatMonthly, 2)
    expect(during.lines.map((l) => l.productId)).toEqual(before.lines.map((l) => l.productId))
  })

  test('backing out of the confirmation leaves the plan alone', async ({ page }) => {
    await openHub(page)
    const before = await storedPlan(page)

    const alternatives = await openSwapAlternatives(page)
    await alternatives.first().click()
    await expect(page.getByText('Confirm your change')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /Back to options/ }).click()

    const after = await storedPlan(page)
    expect(after.flatMonthly).toBeCloseTo(before.flatMonthly, 2)
    expect(after.lines.map((l) => l.productId)).toEqual(before.lines.map((l) => l.productId))
  })

  test('confirming bills exactly what was quoted, from then on', async ({ page }) => {
    await openHub(page)
    const before = await storedPlan(page)

    const alternatives = await openSwapAlternatives(page)
    await alternatives.first().click()
    await expect(page.getByText('Confirm your change')).toBeVisible({ timeout: 15_000 })
    const quoted = monthlyTransition(await page.locator('body').innerText())!

    await page.getByRole('button', { name: /^Confirm change$/ }).click()
    await expect(page.getByText('Confirm your change')).toBeHidden({ timeout: 20_000 })

    /* The figure on the confirmation is the figure the member is billed. These
       used to be two calculations — the screen's and the server's — and the
       whole point of quoting one is that it is the one that happens. */
    await expect.poll(async () => (await storedPlan(page)).flatMonthly, { timeout: 15_000 })
      .toBeCloseTo(quoted.to, 2)

    const after = await storedPlan(page)
    expect(after.lines.map((l) => l.productId)).not.toEqual(before.lines.map((l) => l.productId))
    expect(after.lines).toHaveLength(before.lines.length)
  })

  test('the dashboard shows the new monthly once the change is in', async ({ page }) => {
    await openHub(page)
    const alternatives = await openSwapAlternatives(page)
    await alternatives.first().click()
    await expect(page.getByText('Confirm your change')).toBeVisible({ timeout: 15_000 })
    const quoted = monthlyTransition(await page.locator('body').innerText())!
    await page.getByRole('button', { name: /^Confirm change$/ }).click()

    await page.goto('/myhub')
    await expect(page.getByText('YOUR SUBSCRIPTION')).toBeVisible({ timeout: 20_000 })
    const body = await page.locator('body').innerText()
    const plan = Number(body.match(/Monthly plan\s*£(\d+\.\d{2})/)?.[1])
    expect(plan).toBeCloseTo(quoted.to, 2)
  })
})

test.describe('the plan total follows what is on the plan', () => {
  test('removing a line lowers the monthly by that line’s share', async ({ page }) => {
    await openHub(page)
    const before = await storedPlan(page)
    const dropped = before.lines[0]
    const share = dropped.pricePerDelivery / dropped.deliveryIntervalMonths

    const res = await putPlan(page, { ...before, lines: before.lines.slice(1) })
    expect(res.status()).toBe(200)

    const after = await storedPlan(page)
    expect(after.lines).toHaveLength(before.lines.length - 1)
    expect(after.flatMonthly).toBeCloseTo(before.flatMonthly - share, 1)
  })

  test('a cadence change re-spreads the cost rather than discounting it', async ({ page }) => {
    await openHub(page)
    const before = await storedPlan(page)
    const line = before.lines.find((l) => l.deliveryIntervalMonths === 1)!

    // Every 2 months: the same box, half as often, so half the monthly spread.
    const res = await putPlan(page, {
      ...before,
      lines: before.lines.map((l) => (l.id === line.id ? { ...l, deliveryIntervalMonths: 2 } : l)),
    })
    expect(res.status()).toBe(200)

    const after = await storedPlan(page)
    const changed = after.lines.find((l) => l.id === line.id)!
    expect(changed.deliveryIntervalMonths).toBe(2)
    // The per-delivery price is untouched; only how far it is spread moves.
    expect(changed.pricePerDelivery).toBeCloseTo(line.pricePerDelivery, 2)
    expect(after.flatMonthly).toBeCloseTo(before.flatMonthly - line.pricePerDelivery / 2, 1)
  })
})

test.describe('the member’s browser does not set the price', () => {
  /**
   * Each of these was a working request before `normaliseIncomingSubscription`
   * existed. They are kept as end-to-end checks as well as unit tests because
   * the thing being protected is the route, not the function.
   */

  test('a monthly total of their own choosing is ignored', async ({ page }) => {
    await openHub(page)
    const before = await storedPlan(page)
    const res = await putPlan(page, { ...before, flatMonthly: 1.23 })
    expect(res.status()).toBe(200)
    expect((await storedPlan(page)).flatMonthly).toBeCloseTo(before.flatMonthly, 2)
  })

  test('rewritten line prices are re-priced from what we hold', async ({ page }) => {
    await openHub(page)
    const before = await storedPlan(page)
    await putPlan(page, {
      ...before,
      lines: before.lines.map((l) => ({ ...l, pricePerDelivery: 0.5 })),
      flatMonthly: 1.17,
    })
    const after = await storedPlan(page)
    expect(after.flatMonthly).toBeCloseTo(before.flatMonthly, 2)
    for (const [i, line] of after.lines.entries()) {
      expect(line.pricePerDelivery).toBeCloseTo(before.lines[i].pricePerDelivery, 2)
    }
  })

  test('a self-awarded subscribe-and-save rate is refused', async ({ page }) => {
    await openHub(page)
    const before = await storedPlan(page)
    await putPlan(page, { ...before, subscriptionDiscountRate: 0.95 })
    expect((await storedPlan(page)).subscriptionDiscountRate).toBe(before.subscriptionDiscountRate)
  })

  test('a cadence beyond the configured maximum is clamped', async ({ page }) => {
    await openHub(page)
    const before = await storedPlan(page)
    await putPlan(page, {
      ...before,
      lines: before.lines.map((l) => ({ ...l, deliveryIntervalMonths: 60 })),
    })
    for (const line of (await storedPlan(page)).lines) {
      expect(line.deliveryIntervalMonths).toBeLessThanOrEqual(3)
    }
  })

  test('a self-awarded credit never reaches the balance', async ({ page }) => {
    await openHub(page)
    const before = await storedPlan(page)
    await putPlan(page, { ...before, lines: before.lines.map((l) => ({ ...l, pendingCredit: 500 })) })
    for (const line of (await storedPlan(page)).lines) {
      expect(line.pendingCredit ?? 0).toBe(0)
    }
  })

  test('the shipped count behind the exit settlement cannot be erased', async ({ page }) => {
    await openHub(page)
    const before = await storedPlan(page)
    expect(before.lines[0].deliveriesMade).toBeGreaterThan(0)
    await putPlan(page, { ...before, lines: before.lines.map((l) => ({ ...l, deliveriesMade: 0 })) })
    expect((await storedPlan(page)).lines[0].deliveriesMade).toBe(before.lines[0].deliveriesMade)
  })

  test('a plan carrying a product we do not sell is refused outright', async ({ page }) => {
    await openHub(page)
    const before = await storedPlan(page)
    const res = await putPlan(page, {
      ...before,
      lines: [{ ...before.lines[0], id: 'line-invented', productId: 'no-such-product' }],
    })
    expect(res.status()).toBe(400)
    // And nothing was saved on the way to refusing.
    expect((await storedPlan(page)).lines).toHaveLength(before.lines.length)
  })

  test('a save that changes nothing does not move the monthly', async ({ page }) => {
    await openHub(page)
    const before = await storedPlan(page)
    await putPlan(page, { ...before, dispatchDayOfMonth: 20 })
    expect((await storedPlan(page)).flatMonthly).toBe(before.flatMonthly)
  })
})
