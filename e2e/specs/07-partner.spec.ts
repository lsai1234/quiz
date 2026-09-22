import { test, expect } from '@playwright/test'
import { founderSessionViaApi, createPartner } from '../support/accounts'
import { inspect, report } from '../support/inspect'

/**
 * The Partners Hub — the third product, and the smallest.
 *
 * A partner is created by a founder, invited with a one-time link, sets their
 * own password from it, and then sees their own numbers and nobody else's. The
 * invite email is queued rather than sent (`NOTIFY_SOURCE=manual`), and the
 * hub hands the founder the token to pass on — which is what makes this whole
 * journey walkable without an email provider.
 */

const PASSWORD = 'Partner-passw0rd!'

/** Create a partner and get the invite link a founder would forward. */
async function invitePartner(page: import('@playwright/test').Page) {
  await founderSessionViaApi(page)
  const partner = await createPartner(page, { name: `Invited ${Date.now().toString(36)}` })
  const res = await page.request.post('/api/portal/partners', {
    data: { action: 'invite', id: partner.partner.id },
  })
  expect(res.status(), `invite failed: ${await res.text()}`).toBe(200)
  const { token, kind } = await res.json()
  expect(token).toBeTruthy()
  expect(kind).toBe('invite')
  return { ...partner, token }
}

test.describe('the invite', () => {
  test('a fresh link names who it belongs to without spending it', async ({ page }) => {
    const partner = await invitePartner(page)
    const res = await page.request.get(`/api/partner/set-password?token=${encodeURIComponent(partner.token)}`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.email).toBe(partner.email)

    // Asking twice must not consume it — a partner who opens the link, then
    // reloads, still has a working invite.
    const again = await page.request.get(`/api/partner/set-password?token=${encodeURIComponent(partner.token)}`)
    expect(again.status()).toBe(200)
  })

  test('an expired or invented link is refused, and says so plainly', async ({ page }) => {
    await page.goto('/partner/set-password?token=not-a-real-token')
    await expect(page.getByText(/expired|already been used|link/i).first()).toBeVisible({ timeout: 15_000 })
  })

  test('a partner sets their password from the link and it is spent', async ({ page }) => {
    const partner = await invitePartner(page)
    await page.goto(`/partner/set-password?token=${encodeURIComponent(partner.token)}`)
    await expect(page.getByLabel('New password', { exact: true })).toBeVisible({ timeout: 15_000 })

    await page.getByLabel('New password', { exact: true }).fill(PASSWORD)
    await page.getByLabel('Confirm new password').fill(PASSWORD)
    await page.getByRole('button', { name: /Set|Save|Continue/ }).click()

    // Setting the password signs them straight in — asking again immediately
    // would be friction for nothing.
    await expect(page.getByRole('heading', { name: 'Partner sign-in' })).toBeHidden({ timeout: 20_000 })

    // And the link is now spent.
    const reuse = await page.request.get(`/api/partner/set-password?token=${encodeURIComponent(partner.token)}`)
    expect(reuse.status()).toBe(404)
  })
})

test.describe('the portal', () => {
  test('a partner signs in and sees their own dashboard', async ({ page }) => {
    const partner = await invitePartner(page)
    await page.request.post('/api/partner/set-password', { data: { token: partner.token, password: PASSWORD } })
    await page.request.post('/api/partner/logout')

    await page.goto('/partner')
    await page.getByLabel('Email address').fill(partner.email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Partner sign-in' })).toBeHidden({ timeout: 20_000 })

    // Their own numbers, on the tab the portal opens on.
    await expect(page.getByRole('heading', { name: /What you’re owed/ })).toBeVisible({ timeout: 20_000 })
    /* Their name is in the header on a laptop and hidden on a phone, which is a
       layout decision rather than a fault — so this checks it is *rendered* for
       whoever is signed in, not that it is on screen at every width. */
    await expect(page.getByText(/Invited /).first()).toBeAttached()

    // Their code lives with the rest of what they share.
    await page.getByRole('button', { name: 'Your assets' }).click()
    await expect(page.getByText(partner.code!).first()).toBeVisible({ timeout: 20_000 })
  })

  test('the wrong password is refused', async ({ page }) => {
    const partner = await invitePartner(page)
    await page.request.post('/api/partner/set-password', { data: { token: partner.token, password: PASSWORD } })
    await page.request.post('/api/partner/logout')

    const res = await page.request.post('/api/partner/login', {
      data: { email: partner.email, password: 'wrong-password' },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })

  test('the portal is closed to anyone not signed in', async ({ page }) => {
    await page.goto('/')
    const res = await page.request.get('/api/partner/me')
    expect(res.status()).toBe(401)
  })

  test('the dashboard renders cleanly', async ({ page }) => {
    const partner = await invitePartner(page)
    await page.request.post('/api/partner/set-password', { data: { token: partner.token, password: PASSWORD } })
    await page.goto('/partner')
    await expect(page.getByRole('heading', { name: /What you’re owed/ })).toBeVisible({ timeout: 20_000 })

    /* All three tabs, because each is a different screen and only one of them
       is ever on when the page loads. */
    for (const tab of ['How you’re doing', 'Your assets', 'Your deal']) {
      await page.getByRole('button', { name: tab }).click()
      await page.waitForTimeout(400)
      const findings = await inspect(page)
      expect(report(`/partner — ${tab}`, findings), report(`/partner — ${tab}`, findings)).toBe('')
    }
  })
})

/**
 * Affiliates — the light programme.
 *
 * Same hub, same codes, same ledger. What differs is the deal (one rate, on
 * everything their code brings in), the fact that no free stack is issued, and
 * the front door: a first sign-in rather than an agreement to claim a box with.
 */
test.describe('an affiliate', () => {
  /** Create one and get the link the hub would hand a founder to send on. */
  async function inviteAffiliate(page: import('@playwright/test').Page, commissionPct = 0.12) {
    await founderSessionViaApi(page)
    const affiliate = await createPartner(page, {
      name: `Affiliate ${Date.now().toString(36)}`,
      kind: 'affiliate',
      commissionPct,
      discountPct: 0.2,
    })
    const res = await page.request.post('/api/portal/partners', {
      data: { action: 'invite', id: affiliate.partner.id },
    })
    expect(res.status(), `invite failed: ${await res.text()}`).toBe(200)
    const { token, path } = await res.json()
    return { ...affiliate, token, path }
  }

  test('is created on one rate, with no stack to claim', async ({ page }) => {
    const affiliate = await inviteAffiliate(page, 0.12)

    expect(affiliate.partner.kind).toBe('affiliate')
    // One rate, both halves of the deal — they are paid for the sale, whichever
    // sale it is.
    expect(affiliate.terms.firstOrderPct).toBe(0.12)
    expect(affiliate.terms.renewalPct).toBe(0.12)

    // And nothing was issued for them to sign for: the starter endpoint is the
    // one an influencer's front door reads.
    const claim = await page.request.get(`/api/partner/claim?token=${encodeURIComponent(affiliate.token)}`)
    expect((await claim.json()).starter).toBeNull()
  })

  test('is sent to their own front door, not the agreement', async ({ page }) => {
    const affiliate = await inviteAffiliate(page)
    // The hub decides which door from the record, so a founder cannot send the
    // wrong one.
    expect(affiliate.path).toContain('/partner/join?token=')
  })

  test('signs in from the link, sees the deal, and lands in their hub', async ({ page }) => {
    const affiliate = await inviteAffiliate(page, 0.12)
    await page.goto(affiliate.path)

    // The deal before the credential: their code, what it takes off, and what
    // they earn — in the numbers actually on the account.
    await expect(page.getByText(affiliate.code!, { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/20% off for anyone who uses it/)).toBeVisible()
    await expect(page.getByText(/you earn 12% of every order it brings in/)).toBeVisible()

    // The email they will sign in with, pre-filled from the account so it is a
    // glance rather than a field — and correctable, because the founder typed it.
    await expect(page.getByLabel('Email')).toHaveValue(affiliate.email)

    const findings = await inspect(page)
    expect(report('/partner/join', findings), report('/partner/join', findings)).toBe('')

    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByLabel('Confirm password').fill(PASSWORD)
    await page.getByRole('button', { name: /Set my password/ }).click()

    // Straight into the hub, signed in, with their own numbers on screen.
    await expect(page.getByRole('heading', { name: /What you’re owed/ })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Your deal' }).click()
    /* Twice on the tab, deliberately: what they are on now, and the same
       sentence in the dated history underneath it. `.first()` rather than a
       narrower selector — that the two agree word for word is the point. */
    await expect(page.getByText(/12% of the net on every order your code brings in/).first()).toBeVisible()

    // Nothing to claim: the hub shows an affiliate no free stack.
    await expect(page.getByText(/free stack/i)).toBeHidden()

    // And the link is spent, like any other first sign-in.
    const reuse = await page.request.get(`/api/partner/set-password?token=${encodeURIComponent(affiliate.token)}`)
    expect(reuse.status()).toBe(404)
  })

  test('signs in afterwards with the email and password they chose', async ({ page }) => {
    const affiliate = await inviteAffiliate(page)
    // The founder typed an address from a DM. This one corrects it, which is
    // the whole reason the field is on the form rather than just on screen.
    const theirs = `corrected-${Date.now().toString(36)}@e2e.test`

    await page.goto(affiliate.path)
    await expect(page.getByLabel('Email')).toHaveValue(affiliate.email, { timeout: 20_000 })
    await page.getByLabel('Email').fill(theirs)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByLabel('Confirm password').fill(PASSWORD)
    await page.getByRole('button', { name: /Set my password/ }).click()
    await expect(page.getByRole('heading', { name: /What you’re owed/ })).toBeVisible({ timeout: 20_000 })

    // Signed out and back in on the address they gave, not the one we guessed.
    await page.request.post('/api/partner/logout')
    await page.goto('/partner')
    await page.getByLabel(/email/i).fill(theirs)
    await page.getByLabel(/password/i).fill(PASSWORD)
    await page.getByRole('button', { name: /Sign in/ }).click()
    await expect(page.getByRole('heading', { name: /What you’re owed/ })).toBeVisible({ timeout: 20_000 })
  })

  test('cannot take an email another account already holds', async ({ page }) => {
    // Refused BEFORE the link is spent, so somebody who picks a taken address
    // is not left signed up, unable to correct it, holding a dead link.
    const taken = await inviteAffiliate(page)
    const affiliate = await inviteAffiliate(page)

    const res = await page.request.post('/api/partner/join', {
      data: { token: affiliate.token, email: taken.email, password: PASSWORD },
    })
    expect(res.status()).toBe(409)
    expect((await res.json()).error).toMatch(/already an account/i)

    // Their own link still works.
    const ok = await page.request.post('/api/partner/join', {
      data: { token: affiliate.token, email: affiliate.email, password: PASSWORD },
    })
    expect(ok.status()).toBe(200)
  })

  test('cannot be created without a sensible commission', async ({ page }) => {
    await founderSessionViaApi(page)
    const res = await page.request.post('/api/portal/partners', {
      data: {
        action: 'create',
        kind: 'affiliate',
        name: 'No Rate',
        email: `norate-${Date.now().toString(36)}@e2e.test`,
        discountPct: 0.2,
      },
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toMatch(/commission/i)
  })
})
