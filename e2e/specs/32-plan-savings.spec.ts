import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { addProductToBasket, openBasket, openShop } from '../support/shop'
import { newCustomer, signUpViaApi } from '../support/accounts'
import { openHub, storedPlan } from '../support/hub'

/**
 * One plan saving everywhere, rhythms worked out from a routine, and what plan
 * members get beyond the saving: against the real server, as a shopper and a
 * member would use them.
 */

test.setTimeout(180_000)

type Stored = {
  flatMonthly: number
  subscriptionDiscountRate?: number
  routine?: { trainingFrequency: string | null; weightBand: string | null; source: string } | null
  lines: Array<{ id: string; productId: string; productTitle: string; deliveryIntervalMonths: number; quantity: number }>
  deliveryOverrides?: Record<string, { addedItems?: { productId: string; kind?: string; price: number }[] }>
}
const stored = async (page: Page) => (await storedPlan(page)) as unknown as Stored
const AXE = readFileSync(path.join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8')

/** axe on one part of the page: names, roles, contrast. */
async function audit(page: Page, selector: string, where: string) {
  await page.addScriptTag({ content: AXE })
  const violations = await page.evaluate(async (sel) => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; help: string; nodes: { target: string[] }[] }[] }> } }).axe
    const r = await axe.run(document.querySelector(sel) ?? document, { resultTypes: ['violations'] })
    return r.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)
  }, selector)
  expect(violations, `axe on ${where}`).toEqual([])
}
const real = (tag: string) => {
  const who = newCustomer(tag)
  return { ...who, email: who.email.replace('@e2e.test', '@real.e2e.test') }
}

test('a shop basket every month: the plan saving, each product’s rhythm, and the routine it’s worked out from', async ({ page }) => {
  await signUpViaApi(page, real('savings'))
  await openShop(page)
  await addProductToBasket(page, 'Whey Protein')
  await addProductToBasket(page, 'CHRGD Pre-Workout')
  await openBasket(page)
  const drawer = page.getByRole('dialog', { name: 'Your basket' })
  await drawer.getByRole('button', { name: 'Every month' }).click()

  // The quiz's own saving, for a plan this size, in place of the one-off basket saving.
  await expect(drawer.locator('[data-plan-saving]')).toContainText(/Subscribe and save 15%: £[\d.]+ off a month/)
  const rhythms = drawer.locator('[data-plan-rhythms]')
  await expect(rhythms).toContainText(/Whey Protein\s*every month/)
  await expect(rhythms).toContainText(/Pre-Workout\s*about every 11 weeks/)

  // Our estimate, refined in two questions: five or six training days a week.
  await expect(rhythms).toContainText('Worked out from about 3 training days a week (our estimate).')
  await rhythms.getByRole('button', { name: 'Change' }).click()
  await rhythms.getByRole('button', { name: '5–6 days' }).click()
  await expect(rhythms).toContainText(/Pre-Workout\s*about every 5 weeks/)
  await audit(page, '[data-basket-plan]', 'the monthly basket')
  // The money adds up: a month at shop prices, less the plan saving, is the monthly.
  await expect(drawer.getByText('At shop prices, a month')).toBeVisible()
  await expect(drawer.getByText('Plan saving (15%)')).toBeVisible()
  await expect(rhythms).toContainText('Worked out from 5–6 days a week of training.')

  await drawer.getByRole('button', { name: /Start monthly plan/ }).click()
  const terms = page.getByRole('dialog', { name: 'Confirm the subscription terms' })
  await expect(terms).toBeVisible({ timeout: 15_000 })
  await terms.getByRole('checkbox').check()
  await terms.getByRole('button', { name: 'Continue to payment' }).click()
  await expect(drawer.getByText('Your monthly plan is set up.')).toBeVisible({ timeout: 30_000 })

  // The plan as stored: the saving, the routine, and the rhythm it gave.
  const plan = await stored(page)
  expect(plan.subscriptionDiscountRate).toBe(0.15)
  expect(plan.routine).toMatchObject({ trainingFrequency: '5-6x', source: 'member' })
  expect(plan.lines.find((l) => /Pre-Workout/.test(l.productTitle))?.deliveryIntervalMonths).toBe(1.25)
})

test('“Your routine” in the hub re-times the plan in one confirm, saying what changes first', async ({ page }) => {
  await openHub(page)
  const before = await stored(page)
  await page.getByRole('button', { name: 'Change your routine' }).click()
  const sheet = page.getByRole('dialog', { name: 'Your routine' })
  await expect(sheet).toBeVisible({ timeout: 15_000 })
  await expect(sheet.getByRole('button', { name: 'Update my plan' })).toBeDisabled()
  await sheet.getByRole('radio', { name: '5–6 days' }).click()
  await audit(page, '[role="dialog"]', 'your routine')
  const preview = sheet.locator('[data-routine-preview]')
  await expect(preview).toContainText(/Pre-Workout: about every 11 weeks → about every 5 weeks/)
  await expect(preview).toContainText(new RegExp(`Your monthly £${before.flatMonthly.toFixed(2)} →`))
  await sheet.getByRole('button', { name: 'Update my plan' }).click()

  await expect.poll(async () => (await stored(page)).routine?.trainingFrequency, { timeout: 20_000 }).toBe('5-6x')
  const after = await stored(page)
  expect(after.lines.find((l) => /Pre-Workout/.test(l.productTitle))?.deliveryIntervalMonths).toBe(1.25)
  await expect(page.locator('[data-routine-line]')).toContainText('5–6 days a week of training')
})

test('try something new: one product at a first-time price, into the next box', async ({ page }) => {
  await openHub(page)
  const card = page.locator('[data-try-new]')
  await expect(card).toBeVisible({ timeout: 20_000 })
  await expect(card).toContainText(/in your box on .* for £[\d.]+ \(usually £[\d.]+\)/)
  await card.getByRole('button', { name: 'Add to my next box' }).click()
  await expect(card).toContainText(/Added to your box on .*If you like it, you can add it to every box from your plan\./, { timeout: 20_000 })
  const tried = Object.values((await stored(page)).deliveryOverrides ?? {}).flatMap((o) => o.addedItems ?? []).filter((x) => x.kind === 'try')
  expect(tried).toHaveLength(1)
})
