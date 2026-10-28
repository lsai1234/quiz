import { expect, test, type Page } from '@playwright/test'
import { founderSessionViaApi } from '../support/accounts'

/**
 * The motion foundation (plan Phase 7.1), in a real browser.
 *
 *   1. Shared-element flights, workshop first: in standard size, comfort mode
 *      and under reduced motion, the answer reaches its slot on the stand-in
 *      day ring, flying where motion is allowed and simply arriving where it
 *      isn't; then a screenshot of where it landed.
 *   2. The same flight in the consult: an answered sleep window flies into Amp
 *      as the next scene arrives.
 *   3. Real-user monitoring: the page measures itself after it has loaded, and
 *      the hub's speed panel reads it back by device.
 */

const STILL = { animations: 'disabled' as const, caret: 'hide' as const, maxDiffPixelRatio: 0.02 }

async function openFlightStory(page: Page) {
  await page.goto('/styleguide/consult')
  await page.getByRole('button', { name: 'Shared flight' }).click()
  await expect(page.getByRole('group', { name: 'Day ring (stand-in)' })).toBeVisible()
}

const slot = (page: Page, name: string) => page.locator(`[data-flight-slot="${name}"]`)

for (const mode of ['standard', 'comfort'] as const) {
  test(`workshop: an answer flies into its slot on the ring (${mode})`, async ({ page }) => {
    await openFlightStory(page)
    if (mode === 'comfort') await page.getByRole('button', { name: 'Comfort mode' }).click()
    const ring = page.getByRole('group', { name: 'Day ring (stand-in)' })
    await ring.scrollIntoViewIfNeeded()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    // In flight: one token, moving, carrying the answer.
    const token = page.locator('.amp-flight')
    await expect(token).toHaveText('23:00–07:00')
    expect(await token.evaluate((el) => el.getAnimations().length)).toBeGreaterThan(0)
    // Landed: the token has gone and the slot holds the answer.
    await expect(token).toHaveCount(0)
    await expect(slot(page, 'sleep')).toHaveAttribute('data-filled', 'true')
    await expect(slot(page, 'sleep')).toHaveText('23:00–07:00')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(slot(page, 'caffeine')).toHaveAttribute('data-filled', 'true')
    await expect(page.locator('.amp-flight')).toHaveCount(0)
    await expect(ring).toHaveScreenshot(`flight-ring-${mode}.png`, STILL)
  })
}

test('workshop: under reduced motion the answer arrives without flying', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openFlightStory(page)
  await page.evaluate(() => {
    ;(window as unknown as { flights: number }).flights = 0
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n instanceof HTMLElement && n.classList.contains('amp-flight')) (window as unknown as { flights: number }).flights++
    }).observe(document.body, { childList: true, subtree: true })
  })
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(slot(page, 'sleep')).toHaveAttribute('data-filled', 'true')
  expect(await page.evaluate(() => (window as unknown as { flights: number }).flights)).toBe(0)
  await expect(page.getByRole('group', { name: 'Day ring (stand-in)' })).toHaveScreenshot('flight-ring-reduced.png', STILL)
})

test('consult: an answered sleep window flies into Amp as the next scene arrives', async ({ page }) => {
  await founderSessionViaApi(page)
  await page.goto('/quizv2')
  await expect(page.locator('h1')).toHaveText(/what are you after/i)
  // Under way (the flight code loads after scene one), then on to sleep.
  await page.getByRole('button', { name: /^Energy/ }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('listbox', { name: 'Age band' }).focus()
  await page.keyboard.press('Home')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown')
  await page.getByRole('radio', { name: 'Prefer not to say' }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: /^Monday:/ }).click()
  await page.getByRole('group', { name: 'Monday: what you do' }).getByRole('button', { name: /^Gym/ }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('radio', { name: '3pm dip' }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('radio', { name: 'OK' }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  const token = page.locator('.amp-flight')
  await expect(token).toHaveText(/^\d\d:\d\d–\d\d:\d\d$/)
  await expect(token).toHaveCount(0)
  await expect(page.locator('h1')).toHaveText(/daylight/i)
})

test('real-user monitoring: the page measures itself, and the hub reads it back by device', async ({ page }) => {
  await founderSessionViaApi(page)
  await page.goto('/quizv2')
  await expect(page.locator('h1')).toHaveText(/what are you after/i)
  // The reporter loads a few seconds after load, once the page is idle.
  await page.waitForTimeout(5000)
  await page.getByRole('button', { name: /^Energy/ }).click()
  // Leaving the page is when CLS, INP and the long frames are sent.
  await page.goto('/shop')
  await page.waitForTimeout(500)
  await expect
    .poll(async () => {
      const res = await page.request.get('/api/portal/vitals?founders=1')
      const data = (await res.json()) as { areas: { consult: { rows: { device: string; vitals: { LCP: { samples: number } }; frames: { pages: number } }[] } } }
      const phone = data.areas.consult.rows.find((r) => r.device === 'mobile')
      return phone ? [phone.vitals.LCP.samples > 0, phone.frames.pages > 0] : null
    }, { timeout: 15_000 })
    .toEqual([true, true])
  // Founders are left out unless asked for.
  const without = (await (await page.request.get('/api/portal/vitals')).json()) as { areas: { consult: { rows: unknown[] } } }
  expect(without.areas.consult.rows).toEqual([])
  // And the panel shows it.
  await page.goto('/founderhub/monitoring')
  await page.getByRole('checkbox', { name: /Include founder sessions/ }).check()
  await page.getByRole('radio', { name: 'Consult' }).click()
  await expect(page.locator('[data-device="mobile"]').first()).toBeVisible()
})

/* ── Amp, alive (plan Phase 7.2) ───────────────────────────────────────── */

async function openStory(page: Page, name: string) {
  await page.goto('/styleguide/consult')
  await page.getByRole('button', { name, exact: true }).click()
}

for (const mode of ['standard', 'comfort', 'reduced'] as const) {
  test(`workshop: every Amp state and mood, drawn in SVG (${mode})`, async ({ page }) => {
    if (mode === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' })
    await openStory(page, 'Amp')
    if (mode === 'comfort') await page.getByRole('button', { name: 'Comfort mode' }).click()
    const grid = page.locator('[data-amp-grid]')
    await expect(grid.locator('[data-amp-drawn="svg"]')).toHaveCount(9)
    await expect(grid).toHaveScreenshot(`amp-states-${mode}.png`, STILL)
  })
}

test('workshop: his eyes follow the pointer, he blinks, squashes on a tap and stretches on Next', async ({ page }) => {
  await openStory(page, 'Amp, alive')
  const amp = page.locator('[data-amp-alive] [data-amp-state]')
  const box = (await amp.boundingBox())!
  // The first touch wakes him up (his life loads then); then the pointer, well
  // to his right, moving, as a finger would.
  const right = { x: (page.viewportSize()?.width ?? 390) - 4, y: box.y + box.height / 2 }
  await page.mouse.click(right.x, right.y)
  let wiggle = 0
  await expect
    .poll(async () => {
      await page.mouse.move(right.x - (wiggle++ % 2), right.y)
      return Number(await amp.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--amp-gx')))
    })
    .toBeGreaterThan(0.8)
  // A blink is 130ms, quicker than a poll: count them as they happen.
  await amp.evaluate((el) => {
    const w = window as unknown as { blinks: number }
    w.blinks = 0
    new MutationObserver(() => el.hasAttribute('data-blink') && w.blinks++).observe(el, { attributes: true, attributeFilter: ['data-blink'] })
  })
  await expect.poll(() => page.evaluate(() => (window as unknown as { blinks: number }).blinks), { timeout: 9000 }).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  expect(await amp.locator('.amp-face').evaluate((el) => el.getAnimations().length)).toBeGreaterThan(0)
  // The rig: a later bedtime droops his lids; more energy, more glow.
  const eye = () => amp.evaluate((el) => Number((el as HTMLElement).style.getPropertyValue('--amp-eye')))
  const before = await eye()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /^Bedtime later/ }).click()
  expect(await eye()).toBeLessThan(before)
  await page.getByRole('button', { name: /^Energy up/ }).click()
  await expect(page.locator('[data-amp-alive] [data-amp-glow]')).toHaveAttribute('data-amp-glow', '0.6')
  await page.getByRole('button', { name: 'Add a cup' }).click()
  await expect(amp).toHaveAttribute('data-amp-reaction', 'jitter')
})

test('workshop: under reduced motion he holds still: no following, no blinking, no squash', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openStory(page, 'Amp, alive')
  const amp = page.locator('[data-amp-alive] [data-amp-state]')
  const box = (await amp.boundingBox())!
  const right = { x: (page.viewportSize()?.width ?? 390) - 4, y: box.y + box.height / 2 }
  await page.mouse.click(right.x, right.y)
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(right.x - (i % 2), right.y)
    await page.waitForTimeout(500)
  }
  expect(await amp.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--amp-gx'))).toBe('')
  expect(await amp.getAttribute('data-blink')).toBeNull()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  expect(await amp.locator('.amp-face').evaluate((el) => el.getAnimations().length)).toBe(0)
})

test('consult: Amp glows with the energy being set, and leans as it moves', async ({ page }) => {
  await founderSessionViaApi(page)
  await page.goto('/quizv2')
  await page.getByRole('button', { name: /^Energy/ }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('listbox', { name: 'Age band' }).focus()
  await page.keyboard.press('Home')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown')
  await page.getByRole('radio', { name: 'Prefer not to say' }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: /^Monday:/ }).click()
  await page.getByRole('group', { name: 'Monday: what you do' }).getByRole('button', { name: /^Gym/ }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  // Draw the day full across, then empty: Amp's glow follows the afternoon.
  await drawDay(page, Array(10).fill(0.02))
  await expect(page.locator('[data-amp-glow]')).toHaveAttribute('data-amp-glow', '1')
  await drawDay(page, Array(10).fill(0.98))
  await expect(page.locator('[data-amp-glow]')).toHaveAttribute('data-amp-glow', /^0(\.1)?$/)
})

/* ── The day ring (plan Phase 7.3) ─────────────────────────────────────── */

for (const mode of ['standard', 'comfort', 'reduced'] as const) {
  test(`workshop: the day ring, round Amp and for the read (${mode})`, async ({ page }) => {
    if (mode === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' })
    await openStory(page, 'Day ring')
    if (mode === 'comfort') await page.getByRole('button', { name: 'Comfort mode' }).click()
    const lg = page.locator('[data-ring-lg]')
    await expect(lg.getByRole('img', { name: /^Your day: sleep 23:30 to 06:00, last coffee about 16:00, trains around 18:30/ })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Your day, in words' }).getByRole('listitem')).toHaveCount(5)
    await expect(page.locator('[data-ring-sm]')).toHaveScreenshot(`day-ring-sm-${mode}.png`, STILL)
    await expect(lg).toHaveScreenshot(`day-ring-lg-${mode}.png`, STILL)
  })
}

test('workshop: the ring fills in one answer at a time, and only with what was said', async ({ page }) => {
  await openStory(page, 'Day ring')
  const marks = page.locator('[data-ring-lg] [data-flight-slot]')
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Back an answer' }).click()
  await expect(marks).toHaveCount(0)
  for (const n of [1, 2, 3, 4, 5]) {
    await page.getByRole('button', { name: 'Next answer' }).click()
    await expect(marks).toHaveCount(n)
  }
})

test('consult: the answer lands on its own mark in the day ring', async ({ page }) => {
  await founderSessionViaApi(page)
  await page.goto('/quizv2')
  await page.getByRole('button', { name: /^Energy/ }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('listbox', { name: 'Age band' }).focus()
  await page.keyboard.press('Home')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown')
  await page.getByRole('radio', { name: 'Prefer not to say' }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.locator('[data-day-ring="sm"]')).toBeVisible()
  await page.getByRole('button', { name: /^Monday:/ }).click()
  await page.getByRole('group', { name: 'Monday: what you do' }).getByRole('button', { name: /^Gym/ }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.locator('[data-day-ring="sm"] [data-flight-slot="training"]')).toBeVisible()
  await page.getByRole('radio', { name: '3pm dip' }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('radio', { name: 'OK' }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  // In flight to the sleep arc, then there.
  await expect(page.locator('.amp-flight')).toHaveCount(1)
  const token = await page.locator('.amp-flight').evaluate((el) => (el.getAnimations()[0]?.effect as KeyframeEffect | undefined)?.getKeyframes().at(-1)?.transform as string)
  // Where the arc settles, once the scene has slid in: where the flight aimed.
  await expect(page.locator('.amp-flight')).toHaveCount(0)
  await page.waitForTimeout(300)
  const arc = (await page.locator('[data-day-ring="sm"] [data-flight-slot="sleep"]').boundingBox())!
  const [, x, y] = token.match(/translate\(([\d.]+)px, ([\d.]+)px\)/)!.map(Number)
  expect(x).toBeGreaterThanOrEqual(arc.x - 24)
  expect(x).toBeLessThanOrEqual(arc.x + arc.width + 24)
  expect(y).toBeGreaterThanOrEqual(arc.y - 24)
  expect(y).toBeLessThanOrEqual(arc.y + arc.height + 24)
  await expect(page.getByRole('img', { name: /^Your day: sleep / })).toBeVisible()
})

/* ── Shape your day (plan Phase 7.4) ───────────────────────────────────── */

/** Draws across the curve's box, left to right, through heights 0 (top) to 1 (bottom). */
async function drawDay(page: Page, heights: number[]) {
  // The scene slides in: measure the box once it has stopped moving.
  let box = (await page.locator('[data-day-curve]').boundingBox())!
  await expect(async () => {
    const now = (await page.locator('[data-day-curve]').boundingBox())!
    const still = now.x === box.x && now.y === box.y
    box = now
    expect(still).toBe(true)
  }).toPass({ intervals: [150] })
  const at = (i: number) => ({ x: box.x + 2 + ((box.width - 4) * i) / (heights.length - 1), y: box.y + box.height * heights[i] })
  await page.mouse.move(at(0).x, at(0).y)
  await page.mouse.down()
  for (let i = 1; i < heights.length; i++) await page.mouse.move(at(i).x, at(i).y, { steps: 3 })
  await page.mouse.up()
}

for (const mode of ['standard', 'comfort', 'reduced'] as const) {
  test(`workshop: shape your day, drawn or picked (${mode})`, async ({ page }) => {
    if (mode === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/styleguide/consult')
    await page.getByRole('button', { name: 'Shape your day' }).click()
    const curve = page.locator('[data-day-curve]')
    await expect(curve).toHaveAttribute('data-day-curve', 'empty')
    if (mode === 'comfort') {
      await page.getByRole('button', { name: 'Comfort mode' }).click()
      await page.getByRole('radio', { name: 'Comfort', exact: true }).click()
      await page.getByRole('radio', { name: '3pm dip' }).click()
    } else {
      // Bright morning, a deep dip mid-afternoon, a lift in the evening.
      await drawDay(page, [0.4, 0.25, 0.2, 0.3, 0.65, 0.72, 0.5, 0.35, 0.45, 0.6])
    }
    await expect(curve).toHaveAttribute('data-day-curve', 'set')
    await expect(page.getByRole('img', { name: /^Energy dips around 1[46]:00/ })).toBeVisible()
    await expect(page.locator('[data-curve-read]')).toContainText(/(3pm dip|Drawn) · \d+ \/ 10 in the afternoon/)
    await expect(page.locator('[data-ring-dip]')).toHaveCount(1)
    if (mode !== 'comfort') {
      // Fine-tune: the 16:00 point, dragged up to the top.
      const point = (await page.locator('[data-curve-point="16"]').boundingBox())!
      await page.mouse.move(point.x + point.width / 2, point.y + point.height / 2)
      await page.mouse.down()
      await page.mouse.move(point.x + point.width / 2, (await curve.boundingBox())!.y, { steps: 5 })
      await page.mouse.up()
      await expect(page.locator('[data-curve-read]')).not.toContainText('Dip 16:00')
    }
    await expect(page.locator('[data-story="day-curve"]')).toHaveScreenshot(`day-curve-${mode}.png`, STILL)
  })
}

test('consult: the energy scene takes a drawn day, and the ring draws it', async ({ page }) => {
  await founderSessionViaApi(page)
  await page.goto('/quizv2')
  await page.getByRole('button', { name: /^Energy/ }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('listbox', { name: 'Age band' }).focus()
  await page.keyboard.press('Home')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown')
  await page.getByRole('radio', { name: 'Prefer not to say' }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: /^Monday:/ }).click()
  await page.getByRole('group', { name: 'Monday: what you do' }).getByRole('button', { name: /^Gym/ }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.locator('h1')).toHaveText(/How does your energy go through a day/)
  await expect(page.locator('[data-day-curve]')).toBeVisible()
  await drawDay(page, [0.4, 0.25, 0.2, 0.3, 0.65, 0.72, 0.5, 0.35, 0.45, 0.6])
  await expect(page.getByRole('img', { name: /^Energy dips around 1[46]:00/ })).toBeVisible()
  await expect(page.locator('[data-day-ring="sm"] [data-ring-dip]')).toHaveCount(1)
  await expect(page.getByRole('img', { name: /^Your day: .*energy dips around 1[46]:00/ })).toBeVisible()
})
