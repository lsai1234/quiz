import { test, expect } from '@playwright/test'
import { signUpViaApi, signInAtHub, newCustomer } from '../support/accounts'
import { subscribeFromQuiz } from '../support/quiz'
import { inspect, report } from '../support/inspect'

/**
 * My Hub — where a member manages the plan they bought.
 *
 * In mock-payments mode a sign-in with no stored plan is handed the demo one
 * (see `src/lib/recharge/demo-seed.ts`), which is what makes the hub walkable
 * with no Stripe key. The empty-hub screen needs that seeding switched off and
 * is covered at the bottom, skipped unless the run asks for it.
 */

async function openHub(page: import('@playwright/test').Page) {
  await signUpViaApi(page)
  await page.goto('/myhub')
  await expect(page.getByText('YOUR SUBSCRIPTION')).toBeVisible({ timeout: 20_000 })
}

/** The re-consent notice covers the dashboard until it is answered. */
async function dismissReconsent(page: import('@playwright/test').Page) {
  const notNow = page.getByRole('button', { name: /Not now/ })
  if (await notNow.count()) await notNow.click()
}

test.describe('the gate', () => {
  test('refuses a wrong password without saying which half was wrong', async ({ page }) => {
    const who = await signUpViaApi(page)
    await page.request.post('/api/auth/logout')
    await page.goto('/myhub')
    await page.getByLabel(/email/i).fill(who.email)
    await page.getByLabel(/password/i).fill('not-the-password')
    await page.getByRole('button', { name: /^Sign in/ }).click()
    await expect(page.getByText(/incorrect|not recognised|try again/i).first()).toBeVisible({ timeout: 15_000 })
  })

  test('signs a member in and shows their plan', async ({ page }) => {
    const who = await signUpViaApi(page)
    await page.request.post('/api/auth/logout')
    await signInAtHub(page, who)
    await expect(page.getByText('YOUR SUBSCRIPTION')).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('the dashboard', () => {
  test('names the next box, the monthly amount and what it covers', async ({ page }) => {
    await openHub(page)
    await dismissReconsent(page)

    await expect(page.getByText(/YOUR NEXT BOX/i)).toBeVisible()
    await expect(page.getByText(/HOW YOU’RE BILLED/i)).toBeVisible()
    // Postage is its own line rather than folded into the plan price.
    await expect(page.getByText(/Delivery/).first()).toBeVisible()
    await expect(page.getByText(/Next charge/i)).toBeVisible()

    // The three figures have to add up: plan + delivery = next charge.
    const billing = await page.locator('body').innerText()
    const plan = Number(billing.match(/Monthly plan\s*£(\d+\.\d{2})/)?.[1])
    const delivery = Number(billing.match(/Delivery\s*\+?£(\d+\.\d{2})/)?.[1] ?? 0)
    const next = Number(billing.match(/Next charge\s*£(\d+\.\d{2})/)?.[1])
    expect(plan, `couldn't read the plan figure from:\n${billing.slice(0, 800)}`).toBeGreaterThan(0)
    expect((plan + delivery).toFixed(2)).toBe(next.toFixed(2))
  })

  test('shows a delivery calendar of upcoming boxes', async ({ page }) => {
    await openHub(page)
    await dismissReconsent(page)
    await expect(page.getByText(/DELIVERY CALENDAR/i)).toBeVisible()
    const months = page.getByRole('button').filter({ hasText: /^(NEXT|SEPT|OCT|NOV|DEC|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG)/ })
    expect(await months.count()).toBeGreaterThan(2)
  })

  test('offers the stack controls a member manages their plan with', async ({ page }) => {
    await openHub(page)
    await dismissReconsent(page)
    await expect(page.getByRole('button', { name: 'Add product' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Swap' }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Plan & billing settings/ })).toBeVisible()
  })

  test('renders cleanly', async ({ page }) => {
    await openHub(page)
    await dismissReconsent(page)
    const findings = await inspect(page)
    expect(report('/myhub', findings), report('/myhub', findings)).toBe('')
  })
})

test.describe('re-consent', () => {
  /**
   * The notice is dismissible on purpose: a member on the old terms who says
   * "not now" must keep a working hub rather than a blocked one.
   */
  test('is dismissible, and nothing stops working', async ({ page }) => {
    await openHub(page)
    await expect(page.getByText(/subscription terms have changed/i)).toBeVisible()
    await page.getByRole('button', { name: /Not now/ }).click()
    await expect(page.getByText(/subscription terms have changed/i)).toBeHidden()
    await expect(page.getByRole('button', { name: 'Add product' })).toBeVisible()
  })

  test('accepting records the consent and the notice does not come back', async ({ page }) => {
    await openHub(page)
    await page.getByRole('button', { name: /I’ve read these — accept/ }).click()
    await expect(page.getByText(/subscription terms have changed/i)).toBeHidden({ timeout: 15_000 })
    await page.reload()
    await expect(page.getByText('YOUR SUBSCRIPTION')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/subscription terms have changed/i)).toBeHidden()
  })

  test('a stale terms version is rejected', async ({ page }) => {
    await openHub(page)
    const res = await page.request.post('/api/hub/consent', {
      data: { termsVersion: '1900-01-01', accepted: true },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })
})

test.describe('the exit is a charge, so it is guarded like one', () => {
  test('cancelling while signed out is refused', async ({ page }) => {
    await page.goto('/')
    const res = await page.request.post('/api/hub/subscription/cancel', {
      data: { expectedSettlement: 0 },
    })
    expect(res.status()).toBe(401)
  })

  test('a settlement figure the member did not agree to is refused', async ({ page }) => {
    await openHub(page)
    /* Posting a figure that disagrees with the server's must not charge the
       difference silently — either it is refused outright, or the plan owes
       nothing and £0 was the truth all along. */
    const res = await page.request.post('/api/hub/subscription/cancel', {
      data: { expectedSettlement: -999 },
    })
    expect(res.status(), 'a bogus settlement was accepted').toBeGreaterThanOrEqual(400)
  })
})

test.describe('a brand-new subscriber', () => {
  /**
   * The state the demo plan cannot show.
   *
   * Every other hub spec sees the seeded subscription, which is two months old,
   * so its lines read "Tell us how it's going". A plan created a minute ago is in
   * its first week and reads "Building long-term health · wk 0 of 6" — three
   * times longer, and `Badge` is `shrink-0` with `white-space: nowrap`, so it
   * used to run out of the card and be sliced off mid-word by the card's rounded
   * overflow. Nothing in the static route sweep could reach it, because it only
   * exists for somebody who has just signed up.
   */
  test('sees a hub with nothing cut off', async ({ page }) => {
    const who = newCustomer('fresh')
    await subscribeFromQuiz(page, who)

    await page.goto('/myhub')
    await expect(page.getByText('YOUR SUBSCRIPTION')).toBeVisible({ timeout: 20_000 })
    await dismissReconsent(page)

    // The long-form status pill is on screen — otherwise this is testing nothing.
    await expect(page.getByText(/Building .* · wk \d+ of \d+/i).first()).toBeVisible()

    const findings = await inspect(page)
    expect(report('/myhub (new subscriber)', findings), report('/myhub (new subscriber)', findings)).toBe('')
  })

  test('the delivery calendar boxes hold their own contents', async ({ page }) => {
    const who = newCustomer('fresh-cal')
    await subscribeFromQuiz(page, who)
    await page.goto('/myhub')
    await expect(page.getByText('YOUR SUBSCRIPTION')).toBeVisible({ timeout: 20_000 })
    await dismissReconsent(page)
    await expect(page.getByText(/DELIVERY CALENDAR/i)).toBeVisible()

    /* Each box is a `Button layout="stack"`. It used to be a default row-layout
       button carrying four stacked children, which laid them out side by side
       inside a 160px card and — being centred — spilled out of both edges at
       once, so the dates and prices were cut off left and right. */
    const boxes = page.getByRole('button').filter({ hasText: /^(NEXT|SEPT|OCT|NOV|DEC|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SKIPPED)/ })
    expect(await boxes.count()).toBeGreaterThan(2)

    for (let i = 0; i < Math.min(3, await boxes.count()); i++) {
      const box = boxes.nth(i)
      const fits = await box.evaluate((el) => {
        const b = el.getBoundingClientRect()
        return Array.from(el.querySelectorAll('*')).every((child) => {
          const c = child.getBoundingClientRect()
          if (c.width === 0) return true
          return c.left >= b.left - 1 && c.right <= b.right + 1
        })
      })
      expect(fits, `delivery box ${i} has content outside its own edges`).toBe(true)
    }
  })
})

test.describe('the empty hub', () => {
  test.skip(
    process.env.HUB_DEMO_SUBSCRIPTION !== 'off',
    'needs HUB_DEMO_SUBSCRIPTION=off — otherwise every account is handed the demo plan',
  )

  test('a member with no plan is told so, and offered the quiz', async ({ page }) => {
    const who = await signUpViaApi(page, newCustomer('noplan'))
    await page.goto('/myhub')

    // Signed in, no plan — and the screen has to say both halves.
    await expect(page.getByText(/no plan on this account yet/i)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('link', { name: /Build your stack/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Buy it once from the shop/ })).toBeVisible()

    /* The most useful sentence on the page: a plan lives with the address that
       paid for it, and the hub names the address it is actually showing — which
       is the answer to "I definitely subscribed and it isn't here". */
    await expect(page.getByText(who.email)).toBeVisible()

    const findings = await inspect(page)
    expect(report('/myhub (empty)', findings), report('/myhub (empty)', findings)).toBe('')
  })
})
