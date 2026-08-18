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
