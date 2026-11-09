import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { founderSessionViaApi, newCustomer } from '../support/accounts'
import { answerAllQuestions } from '../support/quiz'

/**
 * The member hub on its own, end to end (mock payments): a founder puts it on
 * sale; the shop shows it; a visitor makes an account on the join page and
 * joins; the quiz runs in hub mode and lands in the hub, not the results page;
 * the membership card shows the price and the next payment, and cancelling
 * keeps the hub open to the end of the month paid. Set HUB_PLAN_SHOTS to keep
 * screenshots.
 */
test.setTimeout(240_000)

const AXE = readFileSync(path.join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8')
const SHOTS = process.env.HUB_PLAN_SHOTS

async function audit(page: Page, where: string, scope: string) {
  await page.addScriptTag({ content: AXE })
  await page.waitForTimeout(400)
  const violations = await page.evaluate(async (sel) => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; help: string; nodes: { target: string[] }[] }[] }> } }).axe
    const root = document.querySelector(sel) ?? document
    const r = await axe.run(root, { resultTypes: ['violations'] })
    return r.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)
  }, scope)
  expect(violations, `axe on ${where}`).toEqual([])
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage()
  await founderSessionViaApi(page)
  await page.request.post('/api/portal/member-hub', { data: { hubPrice: { standalone: false } } })
  await page.request.post('/api/portal/offer', { data: { services: { training: false } } })
  await page.close()
})

test('the hub on its own: shop, join, quiz, hub, cancel', async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const founder = await browser.newPage()
  await founderSessionViaApi(founder)
  // On sale needs something in it: the training plan.
  expect((await founder.request.post('/api/portal/offer', { data: { services: { training: true } } })).status()).toBe(200)
  expect((await founder.request.post('/api/portal/member-hub', { data: { hubPrice: { monthly: 10, standalone: true } } })).status()).toBe(200)
  await founder.close()

  // The shop's front shows it, with the free-with-a-stack line beside it.
  await page.goto('/shop')
  const card = page.locator('[data-shop-hub]')
  await expect(card).toContainText('£10 a month')
  await expect(card).toContainText('Free for 90 days with any stack')
  await card.getByRole('link', { name: 'See what’s inside' }).click()

  // The join page: what's inside, the price, the free-with-a-stack note, and an account first.
  await expect(page).toHaveURL(/\/shop\/hub$/)
  const join = page.locator('[data-hub-join]')
  await expect(join.locator('[data-hub-join-price]')).toHaveText('£10 a month')
  await expect(join).toContainText('A weekly training plan built from your answers')
  await expect(page.locator('[data-hub-join-free]')).toContainText('no subscription and nothing to cancel')
  await audit(page, 'join page', '[data-hub-join]')
  await shot(page, 'join-signed-out')

  const who = newCustomer('hubplan')
  const account = page.locator('[data-hub-join-account]')
  await account.getByLabel('Email').fill(who.email)
  await account.getByLabel('Password').fill(who.password)
  await account.getByRole('button', { name: 'Create account' }).click()
  const cta = page.locator('[data-hub-join-cta]')
  await expect(cta).toHaveText(/Join for £10 a month/)
  await shot(page, 'join-signed-in')
  await cta.click()

  // Mock payments: joined at once, and into the quiz in hub mode.
  await expect(page).toHaveURL(/\?then=hub/)
  await expect(page.locator('[data-hub-setup-banner]')).toBeVisible()
  await answerAllQuestions(page)
  await page.getByRole('button', { name: 'Build my stack' }).click()

  // The hub, not the results page.
  await expect(page).toHaveURL(/\/myhub/, { timeout: 30_000 })
  await expect(page.locator('[data-hub-welcome]')).toContainText('Your hub is open')
  const membership = page.locator('[data-membership]')
  await expect(membership).toHaveAttribute('data-membership-status', 'active')
  await expect(membership.locator('[data-membership-line]')).toContainText('£10 a month · next payment')
  await expect(page.locator('[data-hub-hero]')).toContainText('Hub member')
  await audit(page, 'hub with membership', '[data-membership]')
  await shot(page, 'hub-membership')

  // Cancelling: open to the end of the month paid, nothing more taken, and it can be kept.
  await membership.locator('[data-membership-cancel]').click()
  await page.locator('[data-membership-confirm]').click()
  await expect(membership).toHaveAttribute('data-membership-status', 'cancelling')
  await expect(membership.locator('[data-membership-line]')).toContainText('stays open until')
  await shot(page, 'hub-cancelled')
  await membership.locator('[data-membership-resume]').click()
  await expect(membership).toHaveAttribute('data-membership-status', 'active')

  // The join page now says they're already a member.
  await page.goto('/shop/hub')
  await expect(page.locator('[data-hub-join]')).toContainText('You’re already a member.')
})
