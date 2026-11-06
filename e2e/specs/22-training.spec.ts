import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { founderSessionViaApi, signUpViaApi } from '../support/accounts'
import { completeQuiz } from '../support/quiz'

/**
 * The training plan in the hub: switched on by a founder, opened by an order,
 * a readiness check that keeps nothing, a setup from their answers, a week of
 * sessions, an exercise's detail and a swap, ticks, and changes to the plan.
 * Set TRAINING_SHOTS to a folder to keep screenshots of each screen.
 */
test.setTimeout(240_000)

const AXE = readFileSync(path.join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8')
const SHOTS = process.env.TRAINING_SHOTS

async function audit(page: Page, where: string) {
  await page.addScriptTag({ content: AXE })
  await page.waitForTimeout(500)
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; help: string; nodes: { target: string[] }[] }[] }> } }).axe
    // The screen's own content: the open sheet, or the page's main. (The site-wide
    // viewport tag is the layout's, outside what this feature owns.)
    const root = document.querySelector('[role="dialog"]') ?? document.querySelector('main') ?? document
    const r = await axe.run(root, { resultTypes: ['violations'] })
    return r.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)
  })
  expect(violations, `axe on ${where}`).toEqual([])
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage()
  await founderSessionViaApi(page)
  await page.request.post('/api/portal/offer', { data: { services: { training: false } } })
  await page.close()
})

test('a founder switches it on; an order opens it; the member builds and changes a week', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await founderSessionViaApi(page)
  expect((await page.request.post('/api/portal/offer', { data: { services: { training: true } } })).status()).toBe(200)

  // An order opens it; the box says it comes with one. (Who it stays shut for
  // is the API test's job: a mock deployment gives every account a demo plan.)
  await signUpViaApi(page)
  await completeQuiz(page)
  const box = page.locator('[data-box]')
  await expect(box.locator('[data-box-services] [data-service="training"]')).toBeVisible()
  await box.locator('[data-box-cta]').click()
  const guide = page.locator('[data-guide-link]')
  await expect(guide).toBeVisible({ timeout: 30_000 })
  await page.goto((await guide.getAttribute('href'))!)
  await expect(page.locator('[data-guide-training]')).toBeVisible()

  // From the hub, into the plan.
  await page.goto('/myhub')
  const card = page.locator('[data-tile="week"]')
  await expect(card).toBeVisible({ timeout: 20_000 })
  await card.locator('[data-tile-link="week"]').click()

  // Readiness: all seven, and nothing is kept but that it was done.
  const ready = page.locator('[data-readiness]')
  await expect(ready).toBeVisible()
  await expect(page.locator('[data-ready]')).toBeDisabled()
  await ready.locator('[data-question="0"]').getByRole('radio', { name: 'Yes' }).click()
  await expect(page.locator('[data-gp]')).toBeVisible()
  await shot(page, '1-readiness-gp')
  for (let i = 0; i < 7; i++) await ready.locator(`[data-question="${i}"]`).getByRole('radio', { name: 'No' }).click()
  await audit(page, 'readiness')
  await shot(page, '2-readiness')
  await page.locator('[data-ready]').click()

  // Setup, filled in from the quiz; the member picks kit and experience.
  const setup = page.locator('[data-setup]')
  await expect(setup).toBeVisible()
  await setup.getByRole('radio', { name: /A gym/ }).click()
  await setup.getByRole('radio', { name: /^Some/ }).click()
  await setup.getByRole('button', { name: 'Knees' }).click()
  await expect(setup.getByRole('button', { name: 'Knees' })).toHaveAttribute('aria-pressed', 'true')
  await setup.getByLabel('Activity', { exact: true }).selectOption('yoga')
  await setup.getByLabel('Day', { exact: true }).selectOption('6')
  await setup.locator('[data-add-activity]').click()
  await expect(setup.locator('[data-activity="yoga"]')).toBeVisible()
  await audit(page, 'setup')
  await shot(page, '3-setup')
  await page.locator('[data-build]').click()

  // The week.
  const week = page.locator('[data-week]')
  await expect(week).toBeVisible({ timeout: 30_000 })
  const training = week.locator('[data-session-type="strength"]')
  const count = await training.count()
  expect(count).toBeGreaterThan(0)
  await expect(week.locator('[data-session-type="activity"]').filter({ hasText: 'Yoga' })).toBeVisible()
  await expect(week.getByText(/Working around your knees/)).toBeVisible()
  await audit(page, 'week')
  await shot(page, '4-week')

  // A session: tick a set, open an exercise, swap it.
  await training.first().locator('[data-open-session]').click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  const firstExercise = sheet.locator('[data-exercise]').first()
  const exerciseId = (await firstExercise.getAttribute('data-exercise'))!
  await sheet.getByRole('button', { name: /^Tick set 1 of/ }).first().click()
  await expect(sheet.getByText(/^1 of \d sets$/).first()).toBeVisible()
  // Ticking a set starts the rest timer; it can be skipped.
  await expect(sheet.locator('[data-rest-timer]')).toBeVisible()
  await sheet.getByRole('button', { name: 'Skip rest' }).click()
  await expect(sheet.locator('[data-rest-timer]')).toBeHidden()
  // Log today's best set, and it's kept.
  const log = sheet.locator(`[data-log="${exerciseId}"]`)
  const kg = log.getByLabel('kg')
  if (await kg.count()) await kg.fill('20')
  await log.getByLabel(/^(Reps|Seconds)$/).fill('10')
  await log.locator('[data-log-save]').click()
  await expect(log.getByText(/^Today: /)).toBeVisible()
  await expect(log.locator('[data-log-save]')).toHaveText('Saved')
  if (SHOTS) await sheet.locator(`[data-exercise="${exerciseId}"]`).screenshot({ path: path.join(SHOTS, '5b-log.png') })
  await audit(page, 'session')
  await shot(page, '5-session')

  // A founder's tutorial link shows on the exercise it's for.
  const founder = await page.context().browser()!.newPage()
  await founderSessionViaApi(founder)
  expect((await founder.request.post('/api/portal/training', { data: { id: exerciseId, url: 'https://www.youtube.com/watch?v=abc123' } })).status()).toBe(200)
  expect((await founder.request.post('/api/portal/training', { data: { id: exerciseId, url: 'http://evil.example/x' } })).status()).toBe(400)
  await founder.close()
  await page.reload()
  await week.locator('[data-session-type="strength"]').first().locator('[data-open-session]').click()
  await sheet.locator('[data-exercise]').first().getByRole('button').first().click()
  const detail = sheet.locator(`[data-exercise-detail="${exerciseId}"]`)
  await expect(detail).toBeVisible()
  await expect(detail.getByText('How to do it')).toBeVisible()
  await expect(detail.locator('[data-tutorial-link]')).toHaveAttribute('href', /youtube\.com/)
  await audit(page, 'exercise')
  await shot(page, '6-exercise')
  const alt = detail.locator('[data-alternative]').first()
  const altId = (await alt.getAttribute('data-alternative'))!
  await alt.getByRole('button').click()
  await expect(sheet.locator(`[data-exercise-detail="${altId}"]`)).toBeVisible()
  await sheet.locator('[data-back]').click()
  await expect(sheet.locator(`[data-exercise="${altId}"]`)).toBeVisible()

  // Done, from the sheet.
  await sheet.locator('[data-session-done]').click()
  await expect(sheet.locator('[data-session-done]')).toHaveText('Not done yet')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(week.getByText(/^1 of \d+ done this week$/).first()).toBeVisible()

  // The week as a calendar file, and the next session a tap away.
  const ics = await page.request.get('/api/hub/training/calendar')
  expect(ics.status()).toBe(200)
  expect(await ics.text()).toContain('RRULE:FREQ=WEEKLY')
  await expect(page.locator('[data-up] [data-start]')).toBeVisible()
  if (SHOTS) await page.locator('[data-up]').screenshot({ path: path.join(SHOTS, '4b-up.png') })

  // Change the plan: one more day.
  await page.locator('[data-change]').click()
  const change = page.locator('[data-change-plan]')
  await expect(change).toBeVisible()
  const free = change.locator('[data-day][aria-pressed="false"]').first()
  await free.click()
  await shot(page, '7-change')
  await page.locator('[data-save-plan]').click()
  await expect(change).toBeHidden()
  await expect(week.locator('[data-session-type="strength"]')).toHaveCount(count + 1)

  // And it waits in the hub.
  await page.goto('/myhub')
  await expect(page.locator('[data-tile="week"]')).toContainText(/\d+\/\d+/, { timeout: 20_000 })
})
