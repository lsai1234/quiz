import { readFileSync } from 'fs'
import path from 'path'
import { test, expect, type Page } from '@playwright/test'
import { signUpViaApi, founderSessionViaApi, newCustomer } from '../support/accounts'

/**
 * The hub's feedback page, and the founders' inbox it feeds.
 *
 * What these hold: a member finds the page from the hub's home, sends a message,
 * is told it arrived, and the founders read it in Settings with who sent it.
 */

const AXE = readFileSync(path.join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8')

async function audit(page: Page, where: string) {
  await page.addScriptTag({ content: AXE })
  await page.waitForTimeout(500)
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; help: string; nodes: { target: string[] }[] }[] }> } }).axe
    // The page's own content. The site-wide viewport tag (which turns off
    // pinch-zoom) is a whole-site setting, not this page's.
    const r = await axe.run(document.querySelector('main') ?? document, { resultTypes: ['violations'] })
    return r.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)
  })
  expect(violations, `axe on ${where}`).toEqual([])
}

test('a member sends feedback from the hub, and the founders read it in Settings', async ({ page, browser }) => {
  const who = await signUpViaApi(page, newCustomer('feedback'))
  await page.goto('/myhub')
  await page.getByRole('link', { name: 'Tell us what you think' }).click()
  await expect(page).toHaveURL(/\/myhub\/feedback$/)
  await expect(page.getByRole('heading', { name: 'Tell us what you think' })).toBeVisible()
  await audit(page, 'the feedback page')

  const send = page.getByRole('button', { name: 'Send feedback' })
  // Nothing to send yet.
  await expect(send).toBeDisabled()
  const message = `The calendar is great, but I'd like to see last month too. (${Date.now()})`
  await page.getByLabel('Your feedback').fill(message)
  await send.click()
  await expect(page.getByText(/It’s with us now/)).toBeVisible()

  // The founders, in their own browser.
  const context = await browser.newContext()
  const founder = await context.newPage()
  await founderSessionViaApi(founder)
  await founder.goto('/founderhub/settings/member-feedback')
  const entry = founder.locator('[data-feedback-entry]', { hasText: message })
  await expect(entry).toBeVisible({ timeout: 20_000 })
  await expect(entry.getByText('New')).toBeVisible()
  await expect(entry.getByRole('link', { name: `Reply to ${who.email}` })).toHaveAttribute('href', new RegExp(`^mailto:${who.email}`))
  await context.close()
})

test('the hub says what went wrong when a message can’t be sent, and keeps what was written', async ({ page }) => {
  await signUpViaApi(page)
  await page.goto('/myhub/feedback')
  await page.route('**/api/hub/member-feedback', (route) => route.abort())
  await page.getByLabel('Your feedback').fill('This should stay in the box.')
  await page.getByRole('button', { name: 'Send feedback' }).click()
  await expect(page.getByText(/couldn’t reach CHRGD/)).toBeVisible()
  await expect(page.getByLabel('Your feedback')).toHaveValue('This should stay in the box.')
})
