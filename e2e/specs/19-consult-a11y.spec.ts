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
      for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown')
    } else {
      // Comfort mode: the bands are a radio group.
      await pickRadio(page, /^(Under 18|18–24|25–34)/, /^25–34/)
    }
    await pickRadio(page, /^(Female|Male|Prefer not)/, /^Prefer not/)
  } else if (/training week/i.test(h)) {
    if (await page.getByRole('radiogroup', { name: 'Monday' }).count()) {
      // Comfort mode: each day is its own row of choices.
      await pickRadio(page, /^(Rest|Gym|Cardio|Sport)$/, /^Gym$/)
    } else {
      await tabTo(page, /^Monday/)
      await page.keyboard.press('Enter')
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
      await pickRadio(page, /^(Hardly ever|Some days|Most days|Every day)/, /^Most days/)
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
  } else if (/safety|circuit|before i/i.test(h) || (await page.getByRole('switch', { name: 'None of these' }).count())) {
    await tabTo(page, /^Use my answers here/)
    await page.keyboard.press('Space')
    await tabTo(page, /^None of these$/)
    await page.keyboard.press('Space')
  }
  // Anything else (body map, review) is fine as it stands.
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
    await expect(page.getByRole('button', { name: 'See my stacks' })).toBeVisible({ timeout: 20_000 })
    await audit(page, 'fully charged')
    await tabTo(page, /^See my stacks$/)
    await page.keyboard.press('Enter')
    await expect(page).not.toHaveURL(/\/quizv2$/)
  })

  test('comfort mode passes axe on every screen too', async ({ page }) => {
    await page.getByRole('radio', { name: /^Deep charge/ }).click()
    await page.getByRole('button', { name: 'Bigger text' }).click()
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
