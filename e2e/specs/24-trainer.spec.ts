import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { founderSessionViaApi, signUpViaApi } from '../support/accounts'
import { completeQuiz } from '../support/quiz'

/**
 * Ask your trainer, end to end: a founder names the trainer and switches it
 * on; the results page leads with the member hub and the trainer; after the
 * order, the member asks from their hub; the founders answer in the Founders
 * Hub with a video; the member reads it. Set TRAINING_SHOTS to keep screenshots.
 */
test.setTimeout(240_000)

const AXE = readFileSync(path.join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8')
const SHOTS = process.env.TRAINING_SHOTS

async function audit(page: Page, where: string, scope?: string) {
  await page.addScriptTag({ content: AXE })
  await page.waitForTimeout(500)
  const violations = await page.evaluate(async (sel) => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; help: string; nodes: { target: string[] }[] }[] }> } }).axe
    const root = (sel && document.querySelector(sel)) ?? document.querySelector('[role="dialog"]') ?? document.querySelector('main') ?? document
    const r = await axe.run(root, { resultTypes: ['violations'] })
    return r.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)
  }, scope ?? null)
  expect(violations, `axe on ${where}`).toEqual([])
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage()
  await founderSessionViaApi(page)
  await page.request.post('/api/portal/trainer', { data: { on: false } })
  await page.request.post('/api/portal/offer', { data: { services: { training: false } } })
  await page.close()
})

test('a member asks the trainer; the founders answer with a video', async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await founderSessionViaApi(page)
  const set = await page.request.post('/api/portal/trainer', {
    data: { on: true, trainer: { name: 'Sam', role: 'Co-founder · fitness expert', bio: 'I train five days a week and coach the plan in your hub.', replyHours: 24, dailyLimit: 5 } },
  })
  expect(set.status()).toBe(200)
  expect((await page.request.post('/api/portal/offer', { data: { services: { training: true } } })).status()).toBe(200)

  // The results page: the member hub first, the trainer at its head, and in what the box comes with.
  const who = await signUpViaApi(page)
  await completeQuiz(page)
  const box = page.locator('[data-box]')
  const card = box.locator('[data-hub-card]')
  await expect(card).toBeVisible()
  await expect(card.locator('[data-hub-card-trainer]')).toContainText('Ask Sam')
  await expect(card.locator('[data-hub-card-trainer]')).toContainText('Real person')
  await expect(box.locator('[data-box-services] [data-service="trainer"]')).toBeVisible()
  await expect(box.locator('[data-hub-preview-trainer]')).toContainText('Ask Sam, a real fitness expert')
  await expect(box.locator('[data-rewards-track]')).toBeVisible()
  // The box this feature owns; the page's landmarks and viewport tag are the layout's.
  await audit(page, 'results', '[data-box]')

  await box.locator('[data-box-cta]').click()
  await expect(page.locator('[data-guide-link]')).toBeVisible({ timeout: 30_000 })

  // The hub: the trainer's card, then the chat.
  await page.goto('/myhub')
  const trainerCard = page.locator('[data-trainer-card]')
  await expect(trainerCard).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('[data-hub-nav="trainer"]')).toBeVisible()
  await trainerCard.locator('[data-trainer-open]').click()
  const chat = page.locator('[data-trainer-chat]')
  await expect(chat).toBeVisible()
  await expect(chat.locator('[data-trainer-real]')).toContainText('written by Sam, personally')
  await chat.getByLabel('Your question').fill('How heavy should I go on my first squat session?')
  await chat.locator('[data-trainer-send]').click()
  await expect(chat.locator('[data-message="member"]')).toHaveCount(1)
  await expect(chat.locator('[data-trainer-waiting]')).toBeVisible()
  await audit(page, 'trainer chat')
  await shot(page, '10-trainer-asked')

  // The Founders Hub: the question waits; a founder answers with a video.
  const founders = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await founderSessionViaApi(founders)
  await founders.goto('/founderhub/trainer')
  await expect(founders.locator('[data-trainer-waiting-count]')).toBeVisible({ timeout: 20_000 })
  const row = founders.locator('[data-inbox-row][data-waiting="true"]').first()
  await row.locator('[data-open-thread]').click()
  const thread = founders.locator('[data-thread]')
  await expect(thread).toContainText('How heavy should I go on my first squat session?')
  await expect(thread.locator('[data-thread-training]')).toBeVisible()
  await thread.getByLabel('Your answer').fill('Start with just the bar for two sets, then add 5kg a set while every rep looks the same.')
  await thread.getByLabel('Video link (optional)').fill('https://youtu.be/dQw4w9WgXcQ')
  await thread.getByLabel('Video title (optional)').fill('Squat set-up')
  await thread.locator('[data-send-answer]').click()
  await expect(thread).toContainText('Start with just the bar')
  await audit(founders, 'founders trainer inbox')
  if (SHOTS) await founders.screenshot({ path: path.join(SHOTS, '11-founders-inbox.png'), fullPage: true })
  await founders.close()

  // The member reads it, with its video.
  await page.reload()
  await expect(chat.locator('[data-message="trainer"]')).toContainText('Start with just the bar')
  await expect(chat.locator('[data-trainer-video]')).toHaveAttribute('href', 'https://youtu.be/dQw4w9WgXcQ')
  await shot(page, '12-trainer-answered')

  // Every plan is checked: built, it waits for the trainer; ticked, it says so.
  await page.goto('/myhub/training')
  const ready = page.locator('[data-readiness]')
  await expect(ready).toBeVisible({ timeout: 20_000 })
  for (let i = 0; i < 7; i++) await ready.locator(`[data-question="${i}"]`).getByRole('radio', { name: 'No' }).click()
  await page.locator('[data-ready]').click()
  const setup = page.locator('[data-setup]')
  await setup.getByRole('radio', { name: /A gym/ }).click()
  await setup.getByRole('radio', { name: /^Some/ }).click()
  await page.locator('[data-build]').click()
  await expect(page.locator('[data-plan-check="waiting"]')).toContainText('Sam is checking your plan', { timeout: 30_000 })

  const checker = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await founderSessionViaApi(checker)
  await checker.goto('/founderhub/trainer')
  const plan = checker.locator('[data-plan-row]').filter({ hasText: who.email })
  await expect(plan).toBeVisible({ timeout: 20_000 })
  await plan.getByLabel('A note for them (optional)').fill('Good week. Keep the first squat sets light.')
  await plan.locator('[data-check-plan]').click()
  await expect(plan).toBeHidden()
  await checker.close()

  await page.reload()
  await expect(page.locator('[data-plan-check="checked"]')).toContainText('Checked by Sam', { timeout: 20_000 })
  await audit(page, 'checked plan')
  await shot(page, '13-plan-checked')
})
