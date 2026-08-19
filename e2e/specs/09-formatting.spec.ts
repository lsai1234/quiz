import { test, expect, type Page } from '@playwright/test'
import { inspect, report } from '../support/inspect'
import { founderSessionViaApi, signUpViaApi } from '../support/accounts'

/**
 * Every route, read the way a person reads it.
 *
 * The unit suite holds the source to the design rules; this holds the *output*.
 * It is the pass that catches a label that fell back to its own id, a price that
 * formatted to `£NaN`, an entity that reached the screen as `&amp;`, a glyph
 * drawn at the wrong size, and a heading its box could not hold — none of which
 * are visible to a test that never renders the page.
 *
 * One test per route rather than one loop, so a failure names the screen.
 */

/** Routes anybody can reach. */
const PUBLIC_ROUTES: Array<{ path: string; name: string; ready?: string }> = [
  { path: '/', name: 'the quiz hero', ready: 'Build your stack' },
  { path: '/shop', name: 'the shop', ready: 'Everything, à la carte' },
  { path: '/bundles/leg-day-loading', name: 'a bundle landing page' },
  { path: '/myhub', name: 'the My Hub gate', ready: 'Manage your stack' },
  { path: '/founderhub', name: 'the Founders Hub gate', ready: 'Founder sign-in' },
  { path: '/partner', name: 'the Partners Hub gate', ready: 'Partner sign-in' },
  { path: '/legal/terms', name: 'the terms' },
  { path: '/legal/disclaimer', name: 'the disclaimer' },
  { path: '/legal/competition', name: 'the competition rules' },
  { path: '/styleguide', name: 'the styleguide' },
]

/** Founders Hub — every page behind the gate. */
const FOUNDER_ROUTES: Array<{ path: string; name: string }> = [
  { path: '/founderhub', name: 'the founder dashboard' },
  { path: '/founderhub/commerce', name: 'Commerce' },
  { path: '/founderhub/commerce/orders', name: 'Commerce → Orders' },
  { path: '/founderhub/commerce/queue', name: 'Commerce → Fulfilment queue' },
  { path: '/founderhub/commerce/subscriptions', name: 'Commerce → Subscriptions' },
  { path: '/founderhub/commerce/exits', name: 'Commerce → Exits' },
  { path: '/founderhub/commerce/financials', name: 'Commerce → Financials' },
  { path: '/founderhub/products', name: 'Products' },
  { path: '/founderhub/products/review', name: 'Products → Review' },
  { path: '/founderhub/products/powerbody', name: 'Products → PowerBody' },
  { path: '/founderhub/products/bundles', name: 'Products → Bundles' },
  { path: '/founderhub/products/coverage', name: 'Products → Coverage' },
  { path: '/founderhub/products/dashboard', name: 'Products → Dashboard' },
  { path: '/founderhub/products/readiness', name: 'Products → Readiness' },
  { path: '/founderhub/products/top-25', name: 'Products → Top 25' },
  { path: '/founderhub/pricing', name: 'Pricing' },
  { path: '/founderhub/partners', name: 'Partners' },
  { path: '/founderhub/partners/payouts', name: 'Partners → Payouts' },
  { path: '/founderhub/actions', name: 'Actions' },
  { path: '/founderhub/emails', name: 'Emails' },
  { path: '/founderhub/settings', name: 'Settings' },
  { path: '/founderhub/settings/catalogue', name: 'Settings → Catalogue' },
  { path: '/founderhub/settings/supplier', name: 'Settings → Supplier' },
  { path: '/founderhub/settings/payments', name: 'Settings → Payments' },
  { path: '/founderhub/settings/competition', name: 'Settings → Competition' },
  { path: '/founderhub/settings/share-cards', name: 'Settings → Share cards' },
]

/**
 * Give the page a moment to finish its own client fetches.
 *
 * Several hub screens render a skeleton first and fill in from an API, so
 * inspecting on `load` would scan a placeholder and pass every time.
 */
async function settle(page: Page, ready?: string) {
  if (ready) await expect(page.getByText(ready).first()).toBeVisible({ timeout: 20_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  // Skeletons animate; give the swap to real content a beat to land.
  await page.waitForTimeout(600)
}

test.describe('public screens render cleanly', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route.name} (${route.path})`, async ({ page }) => {
      await page.goto(route.path)
      await settle(page, route.ready)
      const findings = await inspect(page)
      expect(report(route.path, findings), report(route.path, findings)).toBe('')
    })
  }
})

test.describe('Founders Hub screens render cleanly', () => {
  /* The Founders Hub is a desktop tool — dense tables, many columns, an audience
     of about two people at a laptop. Held to a 412px-wide viewport it overflows
     everywhere, and none of that is a fault anybody will ever see. The
     storefront above is checked at both widths, because that one is mobile-first
     and its README tells you so. */
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, 'the Founders Hub is a desktop surface')

  test.beforeEach(async ({ page }) => {
    await founderSessionViaApi(page)
  })

  for (const route of FOUNDER_ROUTES) {
    test(`${route.name} (${route.path})`, async ({ page }) => {
      await page.goto(route.path)
      await settle(page)
      const findings = await inspect(page)
      expect(report(route.path, findings), report(route.path, findings)).toBe('')
    })
  }
})

test('the My Hub dashboard renders cleanly for a member with no plan', async ({ page }) => {
  await signUpViaApi(page)
  await page.goto('/myhub')
  await settle(page)
  const findings = await inspect(page)
  expect(report('/myhub (no plan)', findings), report('/myhub (no plan)', findings)).toBe('')
})

/**
 * A guard on the guard.
 *
 * Every check above passes on every screen, which is either good news or a
 * scanner that has stopped looking. This injects one of each fault it is meant
 * to find and asserts it is reported — so "all green" keeps meaning something.
 */
test('the inspector still catches the faults it is for', async ({ page }) => {
  await page.goto('/legal/terms')
  await page.evaluate(() => {
    const bad = document.createElement('div')
    bad.innerHTML = `
      <p>Â£4.95 a month</p>
      <p>Subscribe &amp;amp; save</p>
      <p>Your plan renews on undefined</p>
      <p>16-24</p>
      <p>Delivery is £4.9</p>
      <p>🎉 nice</p>
      <div style="width:60px;height:14px;overflow:hidden;white-space:nowrap;font-size:12px">
        a heading far too long for the box it was given
      </div>
      <button style="width:30px;height:30px"><svg viewBox="0 0 24 24" width="24" height="24" fill="#ff0000" stroke="#00ff00"><path d="M4 4h16"/></svg></button>`
    document.body.appendChild(bad)
  })

  const kinds = new Set((await inspect(page)).map((f) => f.kind))
  for (const expected of [
    'mojibake', 'raw-entity', 'placeholder', 'money',
    'glyph', 'raw-id', 'clipped-x', 'icon-fill', 'icon-stroke', 'unnamed-control',
  ]) {
    expect(kinds, `the inspector no longer reports "${expected}"`).toContain(expected)
  }
})
