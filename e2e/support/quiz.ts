import { expect, type Page } from '@playwright/test'

/**
 * Driving the quiz.
 *
 * The quiz is five acts on one route with no URL of its own, so there is no way
 * to deep-link into the middle of it — every spec that needs a finished stack
 * has to walk the whole thing. That is what this file is for.
 *
 * Answers are chosen by the label a visitor reads, not by position, so a
 * reordered options grid does not silently change what the suite tested. Steps
 * the map does not name fall through to "first option", which keeps the driver
 * working when a new question appears and makes the new question's own spec the
 * place that pins it down.
 */

/** Which option to take on each question, keyed by the question as displayed. */
const ANSWERS: Record<string, string[]> = {
  "What's the main goal?": ['Build muscle', 'Recover faster'],
  'Anything we should factor in?': ['None of these'],
  'How often do you train?': ['3–4× a week'],
  "What's your main training style?": ['Weights / Lifting'],
  'Primary goal with weights?': ['Build size'],
  'Tell us about yourself': ['Desk job / sedentary'],
  'How do most of your meals happen?': ['Decent but rushed'],
  'Already using any of these?': [],           // deliberately none — "Starting fresh"
  'How do you handle caffeine?': ['Daily coffee'],
  'When do you usually train?': ['Evening'],
}

/** The name typed on the "A little about you" step, asserted later in the hub. */
export const QUIZ_NAME = 'Alex'

export type Track = 'performance' | 'wellbeing'

/** Act 1 — choose a track and enter the questions. */
export async function startQuiz(page: Page, track: Track = 'performance'): Promise<void> {
  await page.goto('/')
  const entry = {
    performance: /Performance \+ wellness/,
    wellbeing: /Everyday wellness/,
  }[track]

  /* The hero is server-rendered, so the button is on screen and clickable a
     good moment before React has attached its handler — a click that lands in
     that window is swallowed silently and the page just sits there. Rather than
     sleeping for a guessed interval, press it until the act actually changes. */
  const button = page.getByRole('button', { name: entry })
  const firstStep = page.getByRole('button', { name: /^Continue|^Pick at least/ })
  await expect(button).toBeVisible()
  await expect
    .poll(
      async () => {
        if (await firstStep.count()) return true
        await button.click({ timeout: 5_000 }).catch(() => {})
        return (await firstStep.count()) > 0
      },
      { timeout: 30_000, intervals: [250, 500, 1000] },
    )
    .toBe(true)
}

/** The question currently on screen, or null once the questions are done. */
export async function currentQuestion(page: Page): Promise<string | null> {
  const h2 = page.locator('h2').first()
  if (!(await h2.count())) return null
  return (await h2.innerText()).trim()
}

/**
 * Answer whatever step is showing and move on.
 *
 * Returns false once the review step's "Build my stack" is up, which is the
 * caller's cue to stop.
 */
export async function answerStep(page: Page): Promise<boolean> {
  const build = page.getByRole('button', { name: 'Build my stack' })
  if (await build.count()) return false

  const question = (await currentQuestion(page)) ?? ''

  // The "about you" step is a form: a name field plus three option grids.
  const nameField = page.getByPlaceholder('Your first name')
  if (await nameField.count()) {
    await nameField.fill(QUIZ_NAME)
    await page.getByRole('button', { name: 'Under 25', exact: true }).click()
    await page.getByRole('button', { name: 'Female', exact: true }).click()
    await page.getByRole('button', { name: '60–75kg', exact: true }).click()
    await continueOn(page)
    return true
  }

  // The safety screen asks for health-data consent before it shows a single
  // option, so the walk has to answer that first or there is nothing to click.
  // The default path consents — it is what most people do and it is the only
  // one that exercises the exclusions. The decline path has its own spec.
  await acceptHealthDataConsent(page)

  const wanted = ANSWERS[question]
  if (wanted && wanted.length) {
    for (const label of wanted) {
      const option = page.getByRole('button', { name: label, exact: false }).first()
      if (await option.count()) await option.click()
    }
  } else if (!wanted) {
    // Unmapped question — take the first real option so the walk continues.
    await clickFirstOption(page)
  }

  await continueOn(page)
  return true
}

/**
 * Press whatever moves the step on.
 *
 * Single-choice steps advance themselves; the rest carry a button whose label
 * changes with the answer ("Continue with 2 goals", "Continue, Alex"), so it is
 * matched on the stem.
 */
async function continueOn(page: Page): Promise<void> {
  const before = await currentQuestion(page)
  const cont = page.getByRole('button', { name: /^Continue/ })
  if (await cont.count()) {
    await cont.first().click()
  }
  // Either way, wait for the question to actually change before returning.
  await expect
    .poll(async () => (await currentQuestion(page)) !== before, { timeout: 10_000 })
    .toBe(true)
}

async function clickFirstOption(page: Page): Promise<void> {
  const buttons = page.getByRole('button')
  const count = await buttons.count()
  for (let i = 0; i < count; i++) {
    const label = (await buttons.nth(i).innerText().catch(() => '')).trim()
    if (!label) continue
    if (/^(Continue|Back|Skip|Edit|Pick |←|Switch to)/i.test(label)) continue
    if (/OPTIONAL · 30 SECONDS/i.test(label)) continue
    await buttons.nth(i).click()
    return
  }
}

/**
 * Walk every question and submit.
 *
 * Bounded rather than `while (true)`: a quiz that stops advancing should fail
 * the spec, not hang until the global timeout.
 */
export async function answerAllQuestions(page: Page): Promise<void> {
  for (let step = 0; step < 25; step++) {
    if (!(await answerStep(page))) return
  }
  throw new Error('quiz never reached the review step after 25 questions')
}

/**
 * The full journey: track → questions → build → the finished stack.
 *
 * Act 3 is a scripted ~10s analysis animation, so the wait is long on purpose
 * and keyed on the reveal's own heading rather than a timeout.
 */
export async function completeQuiz(page: Page, track: Track = 'performance'): Promise<void> {
  await startQuiz(page, track)
  await answerAllQuestions(page)
  await page.getByRole('button', { name: 'Build my stack' }).click()
  /* The reveal's eyebrow is personalised once a name was given ("Alex's
     supplement identity"), so match the part that does not move. */
  await expect(page.getByText(/supplement identity/i)).toBeVisible({ timeout: 45_000 })
}

/* ─── The finished stack: choosing a plan and buying it ────────────────────── */

/**
 * The reveal sells the same stack two ways, on a pair of tabs above the
 * receipt: a one-off bundle, or a monthly plan at the subscribe-and-save rate.
 */
export async function choosePlan(page: Page, plan: 'oneoff' | 'subscription'): Promise<void> {
  const tab = plan === 'oneoff' ? /Just this once/ : /Keep me stocked/
  const control = page.getByRole('button', { name: tab })
  await control.scrollIntoViewIfNeeded()
  await control.click()
}

/** Press whatever the receipt's buy button currently is, and wait for an answer. */
export async function checkoutFromStack(page: Page): Promise<void> {
  // The receipt's own button, by attribute rather than by label: the sticky bar
  // carries the same words, so matching on text finds two and matching on case
  // only worked while the two happened to be capitalised differently.
  const cta = page.locator('[data-checkout-cta]')
  await cta.scrollIntoViewIfNeeded()
  await cta.click()
}

/**
 * The full new-member journey: quiz → subscribe → account → the hub.
 *
 * Worth having as a helper because a brand-new subscription is a *different*
 * screen from the demo one every other hub spec sees. The demo plan is seeded
 * two months in, so its lines read "Tell us how it's going"; a plan created
 * moments ago is in its first week, and its lines read
 * "Building long-term health · wk 0 of 6" — a status pill three times longer,
 * and the one that used to be sliced in half by the card's edge.
 */
export async function subscribeFromQuiz(
  page: Page,
  who: { email: string; password: string },
): Promise<void> {
  await completeQuiz(page)
  await choosePlan(page, 'subscription')
  await checkoutFromStack(page)

  // Signed out, the subscription path opens the account gate inline.
  const submit = page.getByRole('button', { name: /Continue to payment/ })
  await expect(submit).toBeVisible({ timeout: 30_000 })
  await page.locator('input[type="email"]:visible').first().fill(who.email)
  await page.locator('input[type="password"]:visible').first().fill(who.password)

  // Consent is captured on the way through the gate.
  const boxes = page.locator('input[type="checkbox"]:visible')
  for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check().catch(() => {})

  await submit.click()
  await expect(page.getByText(/You’re subscribed|You're subscribed/)).toBeVisible({ timeout: 45_000 })
}

/**
 * Agree to the health-data notice, if it is on screen.
 *
 * A no-op on every step but the safety screen, so callers can invoke it
 * unconditionally rather than tracking which step they are on.
 *
 * Waits for the options to actually appear rather than returning on the click:
 * the grid renders on a state change, and a walker that carries straight on
 * looks for "None of these" a frame before it exists.
 */
export async function acceptHealthDataConsent(page: Page): Promise<void> {
  const tick = healthConsentTick(page)
  if (!(await tick.count())) return
  if ((await tick.first().getAttribute('aria-checked')) === 'true') return
  await tick.first().click()
  await expect(tick.first()).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 })
}

/**
 * Leave it unticked — the path where no health data is collected at all.
 *
 * There is nothing to press: unticked is the default, and that is the point of
 * the control. This exists so a spec can say which path it is on, and so it
 * fails loudly if the tick ever ships pre-ticked.
 */
export async function declineHealthDataConsent(page: Page): Promise<void> {
  const tick = healthConsentTick(page)
  await expect(tick.first()).toBeVisible()
  if ((await tick.first().getAttribute('aria-checked')) === 'true') await tick.first().click()
  await expect(tick.first()).toHaveAttribute('aria-checked', 'false')
}

/** The Article 9 checkbox on the safety screen. */
export function healthConsentTick(page: Page) {
  return page.getByRole('checkbox', { name: /rule products out/i })
}
