import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { openHub, storedPlan } from '../support/hub'

/**
 * One product on a plan, managed from its own sheet, against the real server.
 *
 * Each control has to change what the server holds, the way the screen said it
 * would: how often (counted from the last delivery, worked out by the server),
 * skipping the next one (the product comes out of that box, and is credited),
 * and one more in the next box (on that box's payment). The demo plan is two
 * months in, with pre-workout every 3 months, last sent at signup.
 */

test.setTimeout(180_000)

type Stored = Awaited<ReturnType<typeof storedPlan>> & {
  lines: Array<{ id: string; productTitle: string; deliveryIntervalMonths: number; pendingCredit?: number; cadenceFrom?: { cycle: number; made: number; last: number } }>
  deliveryOverrides?: Record<string, { removedLineIds?: string[]; addedItems?: { productId: string }[] }>
}

const AXE = readFileSync(path.join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8')

/** axe on the open sheet: names, roles, contrast. */
async function auditSheet(page: Page) {
  await page.addScriptTag({ content: AXE })
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; help: string; nodes: { target: string[] }[] }[] }> } }).axe
    const r = await axe.run(document.querySelector('[role="dialog"]') ?? document, { resultTypes: ['violations'] })
    return r.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)
  })
  expect(violations, 'axe on the product sheet').toEqual([])
}

async function openSheet(page: Page, productId: string, title: string) {
  await page.locator(`[data-stack-line="${productId}"]`).getByRole('button', { name: 'Manage' }).click()
  const sheet = page.getByRole('dialog', { name: `Manage ${title}` })
  await expect(sheet).toBeVisible({ timeout: 15_000 })
  return sheet
}

test('how often, skipping the next one and one more in the next box all change the plan for real', async ({ page }) => {
  await openHub(page)
  const before = (await storedPlan(page)) as Stored
  const pre = before.lines.find((l) => /Pre-Workout/.test(l.productTitle))!
  expect(pre.deliveryIntervalMonths).toBe(3)

  // How often: every 3 months runs out early for how fast it's used; every 2 doesn't.
  let sheet = await openSheet(page, pre.productId, pre.productTitle)
  await expect(sheet.getByText('One lasts you about 11 weeks.')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Add one to your next box' })).toBeVisible({ timeout: 15_000 })
  await auditSheet(page)
  await expect(sheet.getByText(/You’d run out about 2 weeks before each one comes/)).toBeVisible()
  await sheet.getByRole('radio', { name: 'Every 2 months' }).click()
  await expect(sheet.getByText(/You’ll have about 2 weeks spare each time/)).toBeVisible()
  await sheet.getByRole('button', { name: /Review change/ }).click()
  // Quoted before it's made: the new monthly, and when the next one comes.
  const review = page.getByRole('dialog', { name: 'Change how often and how many' })
  await expect(review).toBeVisible({ timeout: 15_000 })
  await expect(review.getByText(/counted from the last one you had: the next one comes on/)).toBeVisible()
  await review.getByRole('button', { name: /^Confirm change$/ }).click()

  await expect
    .poll(async () => ((await storedPlan(page)) as Stored).lines.find((l) => l.id === pre.id)?.deliveryIntervalMonths, { timeout: 20_000 })
    .toBe(2)
  const changed = (await storedPlan(page)) as Stored
  // Worked out by the server: last sent at signup (cycle 0), so the next is the next box (cycle 3), then every 2.
  expect(changed.lines.find((l) => l.id === pre.id)!.cadenceFrom).toEqual({ cycle: 3, made: 1, last: 0 })
  expect(changed.flatMonthly).toBeGreaterThan(before.flatMonthly)
  await expect(page.locator(`[data-stack-line="${pre.productId}"]`)).toContainText(/Every 2 months · next/)

  // Skip the next one: it comes out of that box, and its value is credited.
  sheet = await openSheet(page, pre.productId, pre.productTitle)
  await sheet.getByRole('button', { name: 'Skip the next one' }).click()
  const skip = page.getByRole('dialog', { name: 'Skip the next one' })
  await expect(skip.getByText(/It won’t be in your box on .*The one after comes on/)).toBeVisible({ timeout: 15_000 })
  await skip.getByRole('button', { name: /Skip & credit/ }).click()
  await expect
    .poll(async () => ((await storedPlan(page)) as Stored).lines.find((l) => l.id === pre.id)?.pendingCredit ?? 0, { timeout: 20_000 })
    .toBeGreaterThan(0)
  const skipped = (await storedPlan(page)) as Stored
  const removedFrom = Object.entries(skipped.deliveryOverrides ?? {}).filter(([, o]) => o.removedLineIds?.includes(pre.id))
  expect(removedFrom).toHaveLength(1)

  // One more in the next box: on that box's payment, and in the box.
  sheet = await openSheet(page, pre.productId, pre.productTitle)
  const add = sheet.getByRole('button', { name: 'Add one to your next box' })
  await expect(add).toBeVisible({ timeout: 15_000 })
  await add.click()
  await expect(sheet.getByRole('button', { name: 'Added' })).toBeVisible({ timeout: 20_000 })
  const withExtra = (await storedPlan(page)) as Stored
  const extras = Object.values(withExtra.deliveryOverrides ?? {}).flatMap((o) => o.addedItems ?? [])
  expect(extras.map((e) => e.productId)).toContain(pre.productId)
})
