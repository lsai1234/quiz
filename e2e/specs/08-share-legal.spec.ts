import { test, expect } from '@playwright/test'
import { completeQuiz } from '../support/quiz'
import { inspect, report } from '../support/inspect'
import { founderSessionViaApi } from '../support/accounts'

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

test.describe('the uploaded card photography', () => {
  /**
   * The founder uploads six photographs in Settings → Share cards, one per goal
   * family, and every share card is supposed to be printed on the one matching
   * its stack.
   *
   * This walks the whole pipeline — upload, store, serve, render — because the
   * bug it guards lived in none of those pieces and in the wiring between them:
   * `payload.ts` sets `heroImage` from the first product in the stack, and the
   * resolver checked `heroImage` before it looked for an upload. Every piece
   * worked; an uploaded photograph still never reached a real card.
   */
  const KEY = 'strength'

  /** A 1080×1440 JPEG of a known colour, made in the browser. */
  async function uploadArt(page: import('@playwright/test').Page, colour: string) {
    const dataUri = await page.evaluate((fill) => {
      const canvas = document.createElement('canvas')
      canvas.width = 1080
      canvas.height = 1440
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = fill
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', 0.88)
    }, colour)

    const res = await page.request.post('/api/portal/share-art', {
      data: { key: KEY, image: dataUri, width: 1080, height: 1440 },
    })
    expect(res.status(), `upload failed: ${await res.text()}`).toBe(200)
  }

  /** The payload shape `payload.ts` really produces, hero image and all. */
  function cardQuery(withHero: boolean) {
    const payload = {
      v: 1,
      stackName: 'Strength Engine',
      archetype: 'The Athlete',
      focusAreas: [],
      fitScore: 84,
      lineup: [{ slot: 'Protein', product: 'Whey', reason: 'because', dose: '1KG' }],
      coverage: [],
      level: 'performance',
      drinksMode: false,
      artKey: KEY,
      ...(withHero ? { heroImage: 'https://example.com/product-render.png' } : {}),
      createdAt: new Date().toISOString(),
    }
    return Buffer.from(JSON.stringify(payload)).toString('base64url')
  }

  test('an uploaded photograph is stored and served back', async ({ page }) => {
    await founderSessionViaApi(page)
    await uploadArt(page, '#1b5e20')

    const served = await page.request.get(`/api/share/art/${KEY}`)
    expect(served.status()).toBe(200)
    expect(served.headers()['content-type']).toMatch(/^image\//)
    expect((await served.body()).length).toBeGreaterThan(1000)
  })

  test('it reaches a card for a stack that has a product image', async ({ page }) => {
    await founderSessionViaApi(page)

    /* Start from nothing on purpose: the suite shares one database, so a
       photograph uploaded by an earlier test is still there and "before" would
       not be before. */
    await page.request.post('/api/portal/share-art', { data: { key: KEY, action: 'reset' } })

    // The same card before and after an upload. If the upload is reaching the
    // renderer the bytes must change; when the hero won, they never did.
    const before = await (await page.request.get(`/api/share/image?format=story&d=${cardQuery(true)}`)).body()
    await uploadArt(page, '#1b5e20')
    const after = await (await page.request.get(`/api/share/image?format=story&d=${cardQuery(true)}`)).body()

    expect(after.length).toBeGreaterThan(1000)
    expect(
      Buffer.compare(before, after),
      'the card is identical with and without an uploaded photograph — the upload is not reaching it',
    ).not.toBe(0)
  })

  test('removing it puts the card back', async ({ page }) => {
    await founderSessionViaApi(page)
    await page.request.post('/api/portal/share-art', { data: { key: KEY, action: 'reset' } })
    await uploadArt(page, '#1b5e20')
    const withArt = await (await page.request.get(`/api/share/image?format=story&d=${cardQuery(true)}`)).body()

    await page.request.post('/api/portal/share-art', { data: { key: KEY, action: 'reset' } })
    const without = await (await page.request.get(`/api/share/image?format=story&d=${cardQuery(true)}`)).body()

    expect(Buffer.compare(withArt, without)).not.toBe(0)
  })

  test('the settings screen shows what is stored', async ({ page }) => {
    await founderSessionViaApi(page)
    await uploadArt(page, '#1b5e20')

    await page.goto('/founderhub/settings/share-cards')
    await expect(page.getByRole('heading', { name: 'Share cards', level: 1 })).toBeVisible()
    // The preview loads over HTTP from /api/share/art/<key>.
    await expect(page.locator(`img[src*="/api/share/art/${KEY}"]`).first()).toBeVisible({ timeout: 20_000 })
  })
})
