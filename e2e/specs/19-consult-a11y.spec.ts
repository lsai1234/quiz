import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { founderSessionViaApi } from '../support/accounts'

/**
 * The consult's accessibility pass (build U7), in a real browser.
 *
 *   1. axe on every screen, standard size and comfort, colour contrast
 *      included — the one rule jsdom can't run (see level5-a11y.test.tsx).
 *   3. Signed out, /quizv2 shows the founder sign-in and none of the consult.
 *   2. The whole consult, start to handoff, with the keyboard only: every
 *      control reached with Tab and worked with Space, Enter or the arrows.
 */

const AXE = readFileSync(path.join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8')

async function audit(page: Page, where: string) {
  await page.addScriptTag({ content: AXE })
  // Let any enter animation finish, so contrast is read at rest.
  await page.waitForTimeout(700)
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; help: string; nodes: { target: string[] }[] }[] }> } }).axe
    const r = await axe.run(document.querySelector('.amp-consult') ?? document, { resultTypes: ['violations'] })
    return r.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)
  })
  expect(violations, `axe on ${where}`).toEqual([])
}

const heading = (page: Page) => page.locator('h1')
const NEXT = /^(Next|Looks right|Continue|Back to review|See my stacks)$/

/** Tab until the focused element's accessible name matches, then return. Fails if it never gets there. */
async function tabTo(page: Page, name: RegExp, limit = 60) {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab')
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el) return ''
      const labelled = el.getAttribute('aria-labelledby')
      return (
        el.getAttribute('aria-label') ??
        (labelled ? document.getElementById(labelled)?.textContent : null) ??
        el.textContent ??
        ''
      ).trim()
    })
    if (name.test(label)) return
  }
  throw new Error(`Never reached ${name} with Tab`)
}

const focusedName = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    return (el?.getAttribute('aria-label') ?? el?.textContent ?? '').trim()
  })

/**
 * A radio group is one Tab stop; the arrows move within it (the ARIA
 * pattern). Tab in, arrow to `name`, and pick it with Space.
 */
async function pickRadio(page: Page, group: RegExp, name: RegExp) {
  await tabTo(page, group)
  for (let i = 0; i < 8 && !name.test(await focusedName(page)); i++) await page.keyboard.press('ArrowRight')
  expect(await focusedName(page)).toMatch(name)
  await page.keyboard.press('Space')
}

async function nextByKeyboard(page: Page) {
  await tabTo(page, NEXT)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(450)
}

/** Answers whatever scene is showing, by keyboard only. */
async function answerByKeyboard(page: Page) {
  const h = (await heading(page).textContent()) ?? ''
  if (/what are you after/i.test(h)) {
    await tabTo(page, /^Performance/)
    await page.keyboard.press('Space')
  } else if (/about you/i.test(h)) {
    if (await page.getByRole('listbox', { name: 'Age band' }).count()) {
      await tabTo(page, /^Age band/)
      // Home is "Under 18"; two down is 25–34.
      await page.keyboard.press('Home')
      for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowDown')
    } else {
      // Comfort mode: the bands are a radio group.
      await pickRadio(page, /^(Under 18|18–24|25–34)/, /^25–34/)
    }
    await pickRadio(page, /^(Female|Male|Prefer not)/, /^Prefer not/)
  } else if (/niggling|joints|harder than/i.test(h)) {
    // The body map and "what's got harder": blank is an answer.
  } else if (/training for/i.test(h)) {
    // Builders only: what the training is for.
    await pickRadio(page, /^(Build muscle|Get stronger|Play my sport|Go further)/, /^Build muscle/)
  } else if (/training|active is a normal week|moving/i.test(h)) {
    if (await page.getByRole('group', { name: 'Monday' }).count()) {
      // Comfort mode: each day is its own row of choices; Monday's come first.
      await tabTo(page, /^Gym/)
      await page.keyboard.press('Space')
    } else {
      // Tap a day, then what's done on it.
      await tabTo(page, /^Monday:/)
      await page.keyboard.press('Enter')
      await tabTo(page, /^Gym/)
      await page.keyboard.press('Space')
    }
    if (await page.getByRole('radiogroup', { name: 'How hard do most sessions feel?' }).count()) {
      await pickRadio(page, /^(Easy|Steady|Hard)/, /^Steady/)
    }
  } else if (await page.getByRole('slider', { name: 'Afternoon energy' }).count()) {
    await tabTo(page, /Afternoon energy/)
    await page.keyboard.press('End')
  } else if (await page.getByRole('button', { name: 'More energy' }).count()) {
    await tabTo(page, /^More energy$/)
    await page.keyboard.press('Enter')
  } else if (/sleep/i.test(h)) {
    if (await page.getByRole('slider', { name: 'Bedtime' }).count()) {
      await tabTo(page, /^Bedtime/)
      await page.keyboard.press('ArrowRight')
    } else {
      await tabTo(page, /^Bedtime later$/)
      await page.keyboard.press('Enter')
    }
    await pickRadio(page, /^(Great|OK|Restless)/, /^OK/)
  } else if (/daylight|sun|outside/i.test(h)) {
    if (await page.getByRole('slider', { name: 'Daylight' }).count()) {
      await tabTo(page, /^Daylight/)
      await page.keyboard.press('End')
    } else {
      await pickRadio(page, /^(Rarely|1–2 days|3–5 days|Every day)/, /^3–5 days/)
    }
  } else if (/caffeine|coffee|cups|drink/i.test(h)) {
    await tabTo(page, /^None$/)
    await page.keyboard.press('Space')
  } else if (/eat|plate|food/i.test(h)) {
    await tabTo(page, /^Eggs/)
    await page.keyboard.press('Space')
  } else if (/already taking/i.test(h)) {
    await tabTo(page, /^Nothing yet$/)
    await page.keyboard.press('Space')
  } else if (/safety|circuit|before i/i.test(h) || (await page.getByRole('radio', { name: 'None of these' }).count())) {
    // The answer, then the consent under it, which records the answer held.
    await tabTo(page, /None of these$/)
    await page.keyboard.press('Space')
    await tabTo(page, /^Use my answers here/)
    await page.keyboard.press('Space')
    await expect(page.getByRole('radio', { name: /None of these$/ })).toHaveAttribute('aria-checked', 'true')
  }
  // Anything else (body map, "what's got harder", review) is fine blank.
}

/* ── Pinpoint (plan v5) ─────────────────────────────────────────────────── */

const PINPOINT = ['follow-move', 'follow-rest', 'follow-fuel', 'pinpoint']

/** The two phone sizes a Pinpoint question has to fit, founder strip and all. */
const PHONES = [
  { width: 390, height: 664 },
  { width: 375, height: 667 },
]

const sceneId = (page: Page) => page.locator('[data-scene]').getAttribute('data-scene')

/** No page scroll at either phone size: the question, its answers and the way on all in frame. */
async function fitsPhones(page: Page, where: string) {
  for (const size of PHONES) {
    await page.setViewportSize(size)
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight), {
        message: `${where} scrolls at ${size.width}×${size.height}`,
        timeout: 3_000,
      })
      .toBeLessThanOrEqual(0)
  }
  await page.setViewportSize(PHONES[0])
}

/** What's on a Pinpoint screen, so the run knows what it is looking at. */
async function pinpointScreen(page: Page): Promise<'intro' | 'probe' | 'hunch' | 'checkpoint' | 'done'> {
  const has = async (name: string) => (await page.getByRole('button', { name, exact: true }).count()) > 0
  if (await has('Let’s go')) return 'intro'
  if (await has('That’s me')) return 'hunch'
  if (await has('Keep going')) return 'checkpoint'
  if (await has('Continue')) return 'done'
  return 'probe'
}

/** Answers a Pinpoint screen as someone who recognises themselves: That's me, most days, Yes. */
async function answerPinpointScreen(page: Page, comfort = false) {
  const scene = page.locator('[data-scene]')
  const kind = await pinpointScreen(page)
  const tap = (name: string) => page.getByRole('button', { name, exact: true }).first().click()
  if (kind === 'intro') return tap('Let’s go')
  if (kind === 'hunch') return tap('That’s me')
  if (kind === 'checkpoint') return tap('Keep going')
  if (kind === 'done') return tap('Continue')
  const slider = scene.getByRole('slider')
  if (await slider.count()) {
    await slider.focus()
    await page.keyboard.press('ArrowRight')
    return scene.getByRole('button', { name: 'Next', exact: true }).click()
  }
  const radio = (name: string) => scene.getByRole('radio', { name, exact: true })
  if (await radio('Yes').count()) {
    const n = await radio('Yes').count()
    for (let i = 0; i < n; i++) await radio('Yes').nth(i).click()
  } else if (await radio('That’s me').count()) await radio('That’s me').click()
  else if (await radio('Most days').count()) await radio('Most days').click()
  else await scene.getByRole('radiogroup').first().getByRole('radio').first().click()
  // Comfort mode never moves on by itself; a quick-fire card has its own Next in either size.
  const next = scene.getByRole('button', { name: 'Next', exact: true })
  if ((comfort || (await radio('Yes').count())) && (await next.count()) && (await next.isEnabled())) await next.click()
}

test.describe('consult accessibility (U7)', () => {
  test.beforeEach(async ({ page }) => {
    // The consult is founders-only, at /quizv2.
    await founderSessionViaApi(page)
    await page.goto('/quizv2')
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.goto('/quizv2')
    await expect(page.getByRole('radio', { name: /^Deep charge/ })).toBeVisible()
  })

  test('the whole consult by keyboard, with axe on every screen', async ({ page }) => {
    await audit(page, 'route choice')
    await tabTo(page, /Deep charge/)
    await page.keyboard.press('Space')
    await page.waitForTimeout(450)

    const seen: string[] = []
    for (let i = 0; i < 16; i++) {
      const h = (await heading(page).textContent()) ?? ''
      if (/fully charged|your charge profile/i.test(h)) break
      if (!seen.includes(h)) {
        seen.push(h)
        await audit(page, h)
      }
      await answerByKeyboard(page)
      await nextByKeyboard(page)
    }
    expect(seen.length).toBeGreaterThanOrEqual(10)
    // Performance at 25–34 is a builder's consult (batch 5).
    expect(seen).toEqual(expect.arrayContaining(['What’s your training split?', 'What are you training for?']))
    expect(seen).not.toContain('Anything harder than it used to be?')
    await expect(page.getByRole('button', { name: 'See my stacks' })).toBeVisible({ timeout: 20_000 })
    await audit(page, 'fully charged')
    await tabTo(page, /^See my stacks$/)
    await page.keyboard.press('Enter')
    await expect(page).not.toHaveURL(/\/quizv2$/)
  })

  test('comfort mode passes axe on every screen too', async ({ page }) => {
    // Comfort mode isn't offered: it switches itself on for 65 and over.
    await page.getByRole('radio', { name: /^Deep charge/ }).click()
    await page.getByRole('button', { name: /^Healthy ageing/ }).click()
    await nextByKeyboard(page)
    await page.getByRole('listbox', { name: 'Age band' }).focus()
    await page.keyboard.press('End')
    await expect(page.locator('.amp-consult[data-comfort="true"]')).toHaveCount(1)
    await pickRadio(page, /^(Female|Male|Prefer not)/, /^Prefer not/)
    await nextByKeyboard(page)
    const seen: string[] = []
    for (let i = 0; i < 16; i++) {
      const h = (await heading(page).textContent()) ?? ''
      if (/fully charged|your charge profile/i.test(h)) break
      if (!seen.includes(h)) {
        seen.push(h)
        await audit(page, `${h} (comfort)`)
      }
      await answerByKeyboard(page)
      await nextByKeyboard(page)
    }
    expect(seen.length).toBeGreaterThanOrEqual(10)
    // Healthy ageing at 65+ is a different consult, not just bigger text.
    expect(seen).toEqual(expect.arrayContaining(['How active is a normal week?', 'Anything harder than it used to be?']))
    expect(seen).not.toContain('What are you training for?')
  })

  test('Pinpoint: axe on every screen, and every question fits a phone without scrolling', async ({ page }) => {
    await page.setViewportSize(PHONES[0])
    await page.getByRole('radio', { name: /^Pinpoint/ }).click()
    await page.waitForTimeout(450)
    const seen = new Set<string>()
    const kinds: string[] = []
    for (let i = 0; i < 70; i++) {
      const h = (await heading(page).textContent()) ?? ''
      if (/fully charged|your charge profile/i.test(h)) break
      const scene = (await sceneId(page)) ?? ''
      if (!PINPOINT.includes(scene)) {
        if (!seen.has(h)) {
          seen.add(h)
          await audit(page, h)
        }
        await answerByKeyboard(page)
        await nextByKeyboard(page)
        continue
      }
      const kind = await pinpointScreen(page)
      kinds.push(kind)
      const key = `${scene} · ${kind} · ${h}`
      if (!seen.has(key)) {
        seen.add(key)
        await audit(page, key)
        if (kind === 'probe' || kind === 'hunch') await fitsPhones(page, key)
        // The leads sheet, once, over the round.
        if (kind === 'hunch' && !seen.has('leads sheet')) {
          seen.add('leads sheet')
          await page.getByRole('button', { name: /^What I’m thinking/ }).click()
          await expect(page.getByRole('dialog', { name: 'What I’m thinking' })).toBeVisible()
          await audit(page, 'leads sheet')
          await page.keyboard.press('Escape')
          await expect(page.getByRole('dialog')).toHaveCount(0)
        }
      }
      await answerPinpointScreen(page)
      await page.waitForTimeout(450)
    }
    // A real round: an intro, questions, a hunch confirmed, and an ending.
    expect(kinds).toEqual(expect.arrayContaining(['intro', 'probe', 'hunch', 'done']))
    expect(seen.has('leads sheet')).toBe(true)
    await expect(page.getByRole('button', { name: 'See my stacks' })).toBeVisible({ timeout: 20_000 })
    await audit(page, 'fully charged, after Pinpoint')
  })

  test('Pinpoint in comfort mode passes axe too, and waits for Next', async ({ page }) => {
    await page.getByRole('radio', { name: /^Pinpoint/ }).click()
    await page.getByRole('button', { name: /^Healthy ageing/ }).click()
    await nextByKeyboard(page)
    await page.getByRole('listbox', { name: 'Age band' }).focus()
    await page.keyboard.press('End')
    await expect(page.locator('.amp-consult[data-comfort="true"]')).toHaveCount(1)
    await pickRadio(page, /^(Female|Male|Prefer not)/, /^Prefer not/)
    await nextByKeyboard(page)
    const seen = new Set<string>()
    let held = false
    for (let i = 0; i < 70; i++) {
      const h = (await heading(page).textContent()) ?? ''
      if (/fully charged|your charge profile/i.test(h)) break
      const scene = (await sceneId(page)) ?? ''
      if (!PINPOINT.includes(scene)) {
        await answerByKeyboard(page)
        await nextByKeyboard(page)
        continue
      }
      const kind = await pinpointScreen(page)
      const key = `${scene} · ${kind} · ${h}`
      if (!seen.has(key)) {
        seen.add(key)
        await audit(page, `${key} (comfort)`)
      }
      if (!held && kind === 'probe' && (await page.locator('[data-scene]').getByRole('radio', { name: 'That’s me', exact: true }).count())) {
        // A tap picks; nothing moves until Next.
        await page.locator('[data-scene]').getByRole('radio', { name: 'That’s me', exact: true }).click()
        await page.waitForTimeout(600)
        await expect(heading(page)).toHaveText(h)
        await audit(page, `${key}, picked (comfort)`)
        await page.locator('[data-scene]').getByRole('button', { name: 'Next', exact: true }).click()
        await page.waitForTimeout(450)
        held = true
        continue
      }
      await answerPinpointScreen(page, true)
      await page.waitForTimeout(450)
    }
    expect(held).toBe(true)
    await expect(page.getByRole('button', { name: 'See my stacks' })).toBeVisible({ timeout: 20_000 })
  })

  test('Deep charge review offers Pinpoint, and the upgrade keeps every answer', async ({ page }) => {
    await page.getByRole('radio', { name: /^Deep charge/ }).click()
    await page.waitForTimeout(450)
    for (let i = 0; i < 16; i++) {
      if (/what I've got/i.test((await heading(page).textContent()) ?? '')) break
      await answerByKeyboard(page)
      await nextByKeyboard(page)
    }
    await expect(page.getByText('Want me to pinpoint it?')).toBeVisible()
    await audit(page, 'review with the upgrade offer')
    await page.getByRole('button', { name: 'Pinpoint it' }).click()
    await page.waitForTimeout(450)
    expect(PINPOINT).toContain(await sceneId(page))
    // Play it through: back at the review, every answer is still there and the offer has gone.
    for (let i = 0; i < 40 && !/what I've got/i.test((await heading(page).textContent()) ?? ''); i++) {
      if (PINPOINT.includes((await sceneId(page)) ?? '')) await answerPinpointScreen(page)
      else await nextByKeyboard(page)
      await page.waitForTimeout(450)
    }
    await expect(page.getByText('Want me to pinpoint it?')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Training: / })).toBeVisible()
    await audit(page, 'review after the upgrade')
  })

  test('weight loss with a jab: the card opens, the safety check takes it from there, review shows it', async ({ page }) => {
    await page.getByRole('radio', { name: /^Deep charge/ }).click()
    await tabTo(page, /^Weight loss/)
    await page.keyboard.press('Space')
    await tabTo(page, /weight-loss injections or tablets/)
    await page.keyboard.press('Space')
    await expect(page.getByRole('switch', { name: /weight-loss injections or tablets/ })).toHaveAttribute('aria-checked', 'true')
    await audit(page, 'weight loss card, open')
    await nextByKeyboard(page)
    for (let i = 0; i < 12; i++) {
      if (await page.getByRole('radio', { name: 'None of these' }).count()) break
      await answerByKeyboard(page)
      await nextByKeyboard(page)
    }
    // The circuit check: consent, then the medication switch arrives on.
    await page.getByRole('checkbox', { name: /^Use my answers here/ }).click()
    const meds = page.getByRole('checkbox', { name: /^Weight-loss medication/ })
    await expect(meds).toHaveAttribute('aria-checked', 'true')
    await expect(meds).toContainText('You mentioned this on the first screen.')
    await page.getByRole('checkbox', { name: /^Use this to tailor my recommendations/ }).click()
    await page.getByRole('button', { name: /^Nausea/ }).click()
    await audit(page, 'circuit check with weight-loss medication')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(heading(page)).toHaveText(/what I've got/i)
    await expect(page.getByRole('button', { name: /^Circuit check: Weight-loss medication · since starting: nausea/ })).toBeVisible()
    await page.getByRole('button', { name: 'Looks right' }).click()
    await expect(page.getByRole('button', { name: 'See my stacks' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/Tell whoever prescribes your weight-loss medication/)).toBeVisible()
  })

  test('is founders-only: signed out, /quizv2 is the sign-in and /consult leads there', async ({ browser }) => {
    const page = await (await browser.newContext()).newPage()
    await page.goto('/consult')
    await expect(page).toHaveURL(/\/quizv2$/)
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByRole('radio', { name: /^Deep charge/ })).toHaveCount(0)
  })

  test('tells founders what is on: with no OpenAI key, the AI features are off and say why', async ({ page }) => {
    await expect(page.getByText(/Founder preview · AI off/)).toBeVisible()
    await page.getByRole('button', { name: 'What’s on' }).click()
    await expect(page.getByRole('dialog', { name: 'Founder preview' })).toContainText('the server has no OPENAI_API_KEY')
    await page.getByRole('button', { name: /Test the AI now/ }).click()
    await expect(page.getByText(/No OPENAI_API_KEY on the server/)).toBeVisible()
    await audit(page, 'founder preview panel')
  })
})
