import { test, expect, type Page } from '@playwright/test'

/**
 * The adaptive interview (v2).
 *
 * The suite runs with `OPENAI_API_KEY: ''`, so every spec here is already
 * exercising the no-key path: the planner alone, which is the fallback the
 * whole design rests on. The two specs that stub the route are checking the
 * other two failure modes — a 500 and a hang — because those are the ones that
 * could plausibly block a screen if anything ever awaited the steer.
 */

const heading = (page: Page) => page.locator('h2').first()

/** Answer whatever is on screen and wait for the next question to arrive. */
async function answerOne(page: Page, prefer?: string): Promise<string> {
  const before = await heading(page).innerText()

  const nameBox = page.locator('input[autocomplete="given-name"]')
  if (await nameBox.count()) {
    await nameBox.fill('Alex')
    await page.getByRole('button', { name: '35–44' }).click()
    await page.getByRole('button', { name: '75–90kg' }).click()
    await page.getByRole('button', { name: /^Continue/ }).click()
  } else {
    // The safety screen holds its options back until the health-data notice is
    // accepted. Without this the walk clicks straight past on Continue and the
    // arm silently never exercises the exclusions at all.
    const agree = page.getByRole('button', { name: /^Yes — use my answers/ })
    if (await agree.count()) {
      await agree.first().click()
      await expect(page.getByRole('button', { name: 'None of these' })).toBeVisible({ timeout: 10_000 })
    }

    const options = page.locator('.overflow-y-auto button[aria-pressed]')
    const target = prefer ? page.getByRole('button', { name: prefer }) : options.first()
    const cont = page.getByRole('button', { name: /^(Continue|Pick at least one)/ })
    if (await cont.count()) {
      // A multi-select screen: tick something, then Continue.
      if (await cont.isDisabled()) await target.click()
      await page.getByRole('button', { name: /^Continue/ }).click()
    } else {
      await target.click()
    }
  }

  await expect
    .poll(async () => heading(page).innerText(), { timeout: 10_000 })
    .not.toBe(before)
  return heading(page).innerText()
}

/** Open v2 and choose goals. */
async function startV2(page: Page, goal = 'More energy') {
  await page.goto('/quizv2')
  const track = page.getByRole('button', { name: /Performance \+ wellness/ })
  await expect(track).toBeVisible()
  // The page is server-rendered, so the button is clickable a moment before
  // React attaches — press until the screen actually changes (same reasoning
  // as the v1 helper).
  await expect
    .poll(async () => {
      if (await page.getByRole('button', { name: goal }).count()) return true
      await track.click({ timeout: 2000 }).catch(() => {})
      return false
    }, { timeout: 20_000 })
    .toBe(true)

  await page.getByRole('button', { name: goal }).click()
  await page.getByRole('button', { name: /^Continue with/ }).click()
  await expect(heading(page)).toHaveText(/Anything we should factor in/)
}

/** Agree to the health-data notice, so the safety options render at all. */
async function giveConsent(page: Page) {
  const yes = page.locator('.overflow-y-auto button').filter({ hasText: /^Yes —/ }).first()
  if (await yes.count()) await yes.click()
}

/** Walk to the review screen. */
async function toReview(page: Page) {
  for (let i = 0; i < 20; i++) {
    const h = await heading(page).innerText()
    if (/Here is what we heard/i.test(h)) return
    await answerOne(page)
  }
  throw new Error('never reached the review screen')
}

test('runs start to finish and produces a stack', async ({ page }) => {
  await startV2(page)
  await toReview(page)
  await page.getByRole('button', { name: 'Build my stack' }).click()
  await expect(page.getByText('Routine fit')).toBeVisible({ timeout: 30_000 })
})

test('shows the answers back as labels, not ids', async ({ page }) => {
  await startV2(page)
  await toReview(page)
  const review = await page.locator('body').innerText()
  expect(review).toContain('Alex')
  expect(review).toContain('35–44')
  expect(review).not.toContain('35-44')
  expect(review).not.toContain('75-90 ')
})

test('follows the answer it was just given rather than working down a list', async ({ page }) => {
  // The behaviour the whole redesign exists for. "Slow mornings" has to lead
  // somewhere about sleep, not to a generic question about the working day.
  await startV2(page)
  await answerOne(page)                       // safety
  await answerOne(page)                       // about you
  await expect(heading(page)).toHaveText(/When does your energy dip/)

  const next = await answerOne(page, 'Slow mornings')
  expect(next).toMatch(/sleep|nights/i)
})

test('stops asking about sleep once the user says nights are fine', async ({ page }) => {
  // "Nights are fine" clears all four sleep drivers at once, and the planner
  // must then stop spending questions on the topic. A negative answer being
  // this informative is half the point of the driver model.
  //
  // Note it takes two questions to get here, not one: after "slow mornings" the
  // interview asks how LONG they sleep first, and "more than 8 hours" only
  // rules out short nights — unrefreshing sleep is still live, which is exactly
  // why the sleep-shape question is the right next one rather than a
  // repetition.
  await startV2(page)
  await answerOne(page)
  await answerOne(page)
  await answerOne(page, 'Slow mornings')

  for (let i = 0; i < 4; i++) {
    if (/How is your sleep/i.test(await heading(page).innerText())) break
    await answerOne(page, 'More than 8')
  }
  await expect(heading(page)).toHaveText(/How is your sleep/)
  await answerOne(page, 'Nights are fine, actually')

  const seen: string[] = []
  for (let i = 0; i < 10; i++) {
    const now = await heading(page).innerText()
    if (/Here is what we heard/i.test(now)) break
    seen.push(now)
    await answerOne(page)
  }
  expect(seen.join(' | ')).not.toMatch(/nights|sleep/i)
})

test('says what it heard, and what it changed, before the results', async ({ page }) => {
  await startV2(page)
  await answerOne(page)
  await answerOne(page)
  await answerOne(page, 'Slow mornings')
  await toReview(page)
  await page.getByRole('button', { name: 'Build my stack' }).click()

  const recap = page.getByText('What you told us')
  await expect(recap).toBeVisible({ timeout: 15_000 })
  // Both halves of the sentence: the observation and the consequence.
  await expect(page.getByText(/ — so /).first()).toBeVisible()
})

test.describe('when the AI steer fails', () => {
  test('a 500 does not stop the interview', async ({ page }) => {
    await page.route('**/api/quiz/next-questions', (route) =>
      route.fulfill({ status: 500, body: 'nope' }),
    )
    await startV2(page)
    await toReview(page)
    await page.getByRole('button', { name: 'Build my stack' }).click()
    await expect(page.getByText('Routine fit')).toBeVisible({ timeout: 30_000 })
  })

  test('a hanging steer costs the user nothing', async ({ page }) => {
    // The load-bearing assertion of the whole latency design. If ANYTHING in
    // the render path ever awaited the steer, this is where it would show up —
    // the questions would arrive at the 2.5s abort rather than instantly.
    await page.route('**/api/quiz/next-questions', async (route) => {
      await new Promise((r) => setTimeout(r, 10_000))
      await route.abort()
    })

    await startV2(page)
    await answerOne(page)
    await answerOne(page)

    const timings: number[] = []
    for (let i = 0; i < 4; i++) {
      const h = await heading(page).innerText()
      if (/Here is what we heard/i.test(h)) break
      const t0 = Date.now()
      await answerOne(page)
      timings.push(Date.now() - t0)
    }

    expect(timings.length).toBeGreaterThan(0)
    // The renderer's own auto-advance beat is 300ms. A second is generous for
    // that plus a paint, and far below the 2.5s a waited-on steer would cost.
    for (const ms of timings) expect(ms).toBeLessThan(1500)
  })
})

test.describe('the experiment switch', () => {
  test('the homepage serves v1 while the experiment is off', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Performance \+ wellness/ }).click()
    await expect(page.getByRole('button', { name: 'Build muscle' })).toBeVisible()
    // v1's goals step is followed by its own copy; v2's opening question is not
    // reachable on this arm.
    await expect(page.getByText('and they change based on what you say')).toHaveCount(0)
  })

  test('?quizArm=v2 pins the new quiz without switching it on for anyone else', async ({ page }) => {
    await page.goto('/?quizArm=v2')
    const track = page.getByRole('button', { name: /Performance \+ wellness/ })
    // Same hydration race as the v1 helper guards against: the hero is
    // server-rendered, so the card is clickable before React has attached and a
    // single click can be swallowed.
    await expect
      .poll(async () => {
        if (await page.getByRole('button', { name: 'More energy' }).count()) return true
        await track.click({ timeout: 2000 }).catch(() => {})
        return false
      }, { timeout: 20_000 })
      .toBe(true)

    // v2's own line on its opening screen. v1 says "N quick questions".
    await expect(page.getByText('they change based on what you say')).toBeVisible()

    await page.getByRole('button', { name: 'More energy' }).click()
    await page.getByRole('button', { name: /^Continue with/ }).click()
    await expect(heading(page)).toHaveText(/Anything we should factor in/)
  })
})

test.describe('editing an answer from the review screen', () => {
  /** The row's own label, so the assertion names what was tapped. */
  async function tapEdit(page: Page, index: number) {
    const rows = page.locator('.overflow-y-auto button').filter({ hasText: 'Edit' })
    const label = (await rows.nth(index).innerText()).split('\n')[0]
    await rows.nth(index).click()
    return label
  }

  test('goes to the question that was tapped, and comes straight back', async ({ page }) => {
    await startV2(page)
    await answerOne(page)
    await answerOne(page)
    await answerOne(page, 'Slow mornings')
    await toReview(page)

    // The energy row — the third, after goals and the about-you details.
    await tapEdit(page, 2)
    await expect(heading(page)).toHaveText(/When does your energy dip/)

    // Answering returns to the review rather than re-walking the interview.
    await page.getByRole('button', { name: 'Mid-afternoon wall' }).click()
    await expect(heading(page)).toHaveText(/Here is what we heard/, { timeout: 10_000 })
    await expect(page.getByText('Mid-afternoon wall')).toBeVisible()
  })

  test('leaves an edit alone when the reader backs out', async ({ page }) => {
    await startV2(page)
    await answerOne(page)
    await answerOne(page)
    await answerOne(page, 'Slow mornings')
    await toReview(page)

    await tapEdit(page, 2)
    await expect(heading(page)).toHaveText(/When does your energy dip/)
    await page.getByRole('button', { name: 'Back' }).click()

    await expect(heading(page)).toHaveText(/Here is what we heard/)
    await expect(page.getByText('Slow mornings')).toBeVisible()
  })
})

test.describe('the protein check', () => {
  /**
   * The screen that replaces "Do you get protein at every meal?" with a number.
   * `docs/QUIZ_V2_PROTEIN.md` is the design; these are the properties that
   * would be expensive to get wrong and cheap to break.
   */

  /** Walk a muscle-goal run to the protein screen. */
  async function toProtein(page: Page) {
    await startV2(page, 'Build muscle')
    await giveConsent(page)
    await page.getByRole('button', { name: 'None of these' }).click()
    await page.getByRole('button', { name: /^Continue/ }).click()

    await expect(page.locator('input[autocomplete="given-name"]')).toBeVisible()
    await page.locator('input[autocomplete="given-name"]').fill('Alex')
    await page.getByRole('button', { name: '35–44' }).click()
    await page.getByRole('button', { name: '75–90kg' }).click()
    await page.getByRole('button', { name: /^Continue/ }).click()

    for (let i = 0; i < 14; i++) {
      const h = await heading(page).innerText()
      if (/normal day of eating/i.test(h)) return
      if (/Here is what we heard/i.test(h)) break
      await answerOne(page)
    }
    throw new Error('never reached the protein screen')
  }

  const strip = (page: Page) => page.locator('[aria-live="polite"]')

  test('reads as an ordinary question, and one tap answers it', async ({ page }) => {
    // The design goal for the majority path: no evidence a module exists.
    await toProtein(page)
    await expect(page.getByRole('button', { name: /I honestly have no idea/ })).toBeVisible()
    // Nothing has moved and nothing is claimed before the first tap.
    await expect(strip(page)).toHaveText('')

    await page.getByRole('button', { name: 'Three normal meals' }).click()
    await expect(strip(page)).toContainText('≈75g a day')
    await expect(strip(page)).toContainText('target 130–180g')
  })

  test('never shows the target before the estimate', async ({ page }) => {
    // Showing a number first anchors the self-report it is about to be compared
    // against, and we would then be selling a gap computed from an answer we
    // biased. The hint says what we know, not what it adds up to.
    await toProtein(page)
    const hint = await page.locator('h2 ~ p').first().innerText()
    expect(hint).not.toMatch(/\d+\s*g\b/)
    expect(hint).toMatch(/lift|active|eating less|training/i)
  })

  test('the counted day builds, and only compares once it is finished', async ({ page }) => {
    await toProtein(page)
    await page.getByRole('button', { name: /Rather work it out properly/ }).click()

    await page.getByRole('button', { name: 'Toast, cereal or fruit' }).click()
    await expect(strip(page)).toHaveText(/≈8g so far/)
    // A part-built total must never be held up against a full day: "25g against
    // 130g" reads as catastrophe to someone who has not got to lunch yet.
    await expect(strip(page)).not.toContainText('target')

    await page.getByRole('button', { name: 'Sandwich, wrap or salad' }).click()
    await expect(strip(page)).toHaveText(/≈28g so far/)
    await page.getByRole('button', { name: 'Meat or fish, decent size' }).click()
    await page.getByRole('button', { name: 'Nuts, cheese or yoghurt' }).click()

    await expect(strip(page)).toContainText('≈78g a day')
    await expect(strip(page)).toContainText('target 130–180g')
  })

  test('any meal is one tap from being changed once the day is done', async ({ page }) => {
    // Without the summary, changing lunch means pressing "back a meal" three
    // times — which is exactly what an edit from the review screen asks for.
    await toProtein(page)
    await page.getByRole('button', { name: /Rather work it out properly/ }).click()
    for (const pick of ['Eggs, yoghurt or similar', 'Chicken, fish or similar', 'A big portion', 'A shake or a protein bar']) {
      await page.getByRole('button', { name: pick }).click()
    }
    await expect(strip(page)).toContainText('≈147g a day')

    await page.locator('.overflow-y-auto button').filter({ hasText: 'Lunch' }).first().click()
    await expect(page.getByText('And lunch?')).toBeVisible()
    await page.getByRole('button', { name: 'I skip it' }).click()
    await expect(strip(page)).toContainText('≈112g a day')
  })

  test('says so, warmly, when there is nothing to sell', async ({ page }) => {
    // The one verdict that costs us a line item, and the reason the other three
    // are worth believing.
    await toProtein(page)
    await page.getByRole('button', { name: /Rather work it out properly/ }).click()
    for (const pick of ['A shake', 'A big portion', 'A big portion', 'Two or more of those']) {
      await page.getByRole('button', { name: pick }).click()
    }
    await expect(strip(page)).toContainText('≈195g a day')
    await expect(strip(page)).toContainText(/plenty/i)
    await expect(strip(page)).toContainText(/leave protein out of your box/i)
  })

  test('shows the number back on the review screen, not the food', async ({ page }) => {
    await toProtein(page)
    await page.getByRole('button', { name: 'Not much until dinner' }).click()
    await page.getByRole('button', { name: /^Continue/ }).click()
    await toReview(page)

    const review = await page.locator('body').innerText()
    expect(review).toContain('≈55g a day · target 130–180g')
    expect(review).not.toContain('Not much until dinner')
  })

  test('an edit reopens the door they used, in the state they left it', async ({ page }) => {
    await toProtein(page)
    await page.getByRole('button', { name: /Rather work it out properly/ }).click()
    for (const pick of ['Eggs, yoghurt or similar', 'Chicken, fish or similar', 'A big portion', 'A shake or a protein bar']) {
      await page.getByRole('button', { name: pick }).click()
    }
    await page.getByRole('button', { name: /^Continue/ }).click()
    await toReview(page)

    const row = page.locator('.overflow-y-auto button').filter({ hasText: 'A NORMAL DAY' }).first()
    await row.click()
    // The summary of four answered meals — not back at breakfast, and not the
    // presets. The picks arrive a render late here, which is what used to break it.
    await expect(page.getByText('Your day')).toBeVisible()
    await expect(page.getByText('Chicken, fish or similar')).toBeVisible()
    await expect(strip(page)).toContainText('≈147g a day')
  })

  test('is never put to someone who declined the health-data notice', async ({ page }) => {
    // Declining produces no safety answer at all, not an empty one — so a guard
    // written as "pregnancy is not ticked" would be true for everyone who
    // declined, including the person it exists for.
    await startV2(page, 'Build muscle')
    await page.getByRole('button', { name: /^Skip this/ }).click()
    await page.getByRole('button', { name: /^Continue/ }).click()

    await page.locator('input[autocomplete="given-name"]').fill('Alex')
    await page.getByRole('button', { name: '35–44' }).click()
    await page.getByRole('button', { name: '75–90kg' }).click()
    await page.getByRole('button', { name: /^Continue/ }).click()

    for (let i = 0; i < 20; i++) {
      const h = await heading(page).innerText()
      if (/Here is what we heard/i.test(h)) break
      expect(h).not.toMatch(/normal day of eating/i)
      await answerOne(page)
    }
    await expect(heading(page)).toHaveText(/Here is what we heard/)
  })

  test('is never put to someone who is pregnant or breastfeeding', async ({ page }) => {
    await startV2(page, 'Build muscle')
    await giveConsent(page)
    await page.getByRole('button', { name: 'Pregnant or breastfeeding' }).click()
    await page.getByRole('button', { name: /^Continue/ }).click()

    await page.locator('input[autocomplete="given-name"]').fill('Alex')
    await page.getByRole('button', { name: '35–44' }).click()
    await page.getByRole('button', { name: '75–90kg' }).click()
    await page.getByRole('button', { name: /^Continue/ }).click()

    for (let i = 0; i < 20; i++) {
      const h = await heading(page).innerText()
      if (/Here is what we heard/i.test(h)) break
      expect(h).not.toMatch(/normal day of eating/i)
      await answerOne(page)
    }
    await expect(heading(page)).toHaveText(/Here is what we heard/)
  })
})
