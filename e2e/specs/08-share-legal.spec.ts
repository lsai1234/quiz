import { test, expect } from '@playwright/test'
import { completeQuiz } from '../support/quiz'
import { inspect, report } from '../support/inspect'

/**
 * The share card, and the legal screens.
 *
 * Sharing is the one journey that leaves the site: the card is minted here, and
 * the link is opened by somebody who has never seen the quiz. Both halves are
 * walked — the mint from a finished stack, and the page a stranger lands on.
 */

test.describe('sharing a stack', () => {
  test('a finished stack offers a share card, and the sheet opens', async ({ page }) => {
    await completeQuiz(page)
    const share = page.getByRole('button', { name: /Share your stack/ })
    await share.scrollIntoViewIfNeeded()
    await share.click()

    const sheet = page.getByRole('dialog', { name: 'Share your stack' })
    await expect(sheet).toBeVisible({ timeout: 20_000 })

    const findings = await inspect(page)
    expect(report('the share sheet', findings), report('the share sheet', findings)).toBe('')
  })

  test('a minted link opens for somebody who never took the quiz', async ({ page, context, baseURL }) => {
    /* The sheet puts the link on the clipboard rather than on screen, so the
       spec reads it the same way the member would paste it. */
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL! })

    await completeQuiz(page)
    const share = page.getByRole('button', { name: /Share your stack/ })
    await share.scrollIntoViewIfNeeded()
    await share.click()
    await expect(page.getByRole('dialog', { name: 'Share your stack' })).toBeVisible({ timeout: 20_000 })

    await page.getByRole('button', { name: /Copy the link/ }).click()

    let link = ''
    await expect
      .poll(async () => {
        link = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '')
        return /\/s\/[A-Za-z0-9_-]+/.test(link)
      }, { timeout: 30_000 })
      .toBe(true)

    /* Short, and short for a reason. The fallback is a ~2,600-character URL
       carrying the whole stack base64'd in its query string; it works, but it is
       what gets pasted into an Instagram story, and it puts the stack in every
       link preview and referrer along the way. The mint exists to avoid that. */
    expect(link, `the share link is the long fallback:\n${link}`).toMatch(/\/s\/[A-Za-z0-9_-]+$/)
    expect(link.length).toBeLessThan(120)

    // A clean browser: no quiz answers, no persisted store, nothing.
    const stranger = await context.browser()!.newPage()
    await stranger.goto(link)
    await expect(stranger.getByText(/stack|£\d/i).first()).toBeVisible({ timeout: 20_000 })
    const findings = await inspect(stranger)
    expect(report('a shared card', findings), report('a shared card', findings)).toBe('')
    await stranger.close()
  })

  test('an invented share token does not render somebody else’s stack', async ({ page }) => {
    const res = await page.goto('/s/not-a-real-token')
    // Either a 404, or a page that plainly says the link is no good.
    if (res && res.status() === 200) {
      await expect(page.getByText(/expired|no longer|not found|couldn’t find/i).first())
        .toBeVisible({ timeout: 15_000 })
    } else {
      expect(res?.status()).toBe(404)
    }
  })
})

test.describe('the legal screens', () => {
  const PAGES = [
    { path: '/legal/terms', name: 'terms' },
    { path: '/legal/disclaimer', name: 'disclaimer' },
    { path: '/legal/competition', name: 'competition rules' },
  ]

  for (const { path, name } of PAGES) {
    test(`the ${name} are readable and dated`, async ({ page }) => {
      await page.goto(path)
      const body = await page.locator('body').innerText()
      /* Substance, or an honest empty state. The competition page correctly
         says "No competition is running" when there is no giveaway on, and a
         length check alone reads that as a broken page. */
      const saysNothingIsOn = /no competition is running/i.test(body)
      if (!saysNothingIsOn) {
        expect(body.length, `${path} is nearly empty`).toBeGreaterThan(400)
      }
      expect(body).not.toMatch(/lorem ipsum/i)
      const findings = await inspect(page)
      expect(report(path, findings), report(path, findings)).toBe('')
    })
  }
})
