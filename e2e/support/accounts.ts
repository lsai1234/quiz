import { expect, type Page } from '@playwright/test'

/**
 * Signing in, as each of the three kinds of person the product has.
 *
 * Founder credentials come from the config's `webServer.env`, so the hub is
 * never running on the demo accounts that a production build refuses; customer
 * and partner accounts are made per-spec, because both own data and a shared
 * fixture account would make specs depend on the order they ran in.
 */

export const FOUNDER = {
  email: 'founder@e2e.test',
  password: 'e2e-founder-pw',
  name: 'E2E Founder',
}

/** A fresh customer address. Unique per call so specs never collide. */
export function newCustomer(tag = 'member') {
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  return {
    email: `${tag}-${stamp}@e2e.test`,
    password: 'E2e-passw0rd!',
    name: 'Alex Tester',
  }
}

/* ─── Customers ───────────────────────────────────────────────────────────── */

/**
 * Create a signed-in customer without walking the sign-up screen.
 *
 * `page.request` shares the page's cookie jar, so the session cookie the API
 * sets is the one the browser then navigates with. Specs that are *about* the
 * sign-up screen drive the form instead — this is for the ones that need an
 * account in order to test something else.
 */
export async function signUpViaApi(page: Page, who = newCustomer()) {
  const res = await page.request.post('/api/auth/signup', {
    data: { email: who.email, password: who.password, name: who.name },
  })
  expect(res.status(), `signup failed: ${await res.text()}`).toBe(200)
  return who
}

export async function signInViaApi(page: Page, who: { email: string; password: string }) {
  const res = await page.request.post('/api/auth/login', {
    data: { email: who.email, password: who.password },
  })
  expect(res.status(), `login failed: ${await res.text()}`).toBe(200)
  return who
}

/** Sign in through the My Hub screen, as a member actually does. */
export async function signInAtHub(page: Page, who: { email: string; password: string }) {
  await page.goto('/myhub')
  await page.getByLabel(/email/i).fill(who.email)
  await page.getByLabel(/password/i).fill(who.password)
  await page.getByRole('button', { name: /^Sign in/ }).click()
  await expect(page.getByRole('button', { name: /^Sign in/ })).toBeHidden({ timeout: 20_000 })
}

/* ─── Founders ────────────────────────────────────────────────────────────── */

/** Sign in to the Founders Hub through its own form. */
export async function signInAtFounderHub(page: Page): Promise<void> {
  await page.goto('/founderhub')
  await page.getByLabel(/email/i).fill(FOUNDER.email)
  await page.getByLabel(/password/i).fill(FOUNDER.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Founder sign-in' })).toBeHidden({ timeout: 20_000 })
}

/** The same, by API, for specs whose subject is a hub page rather than its gate. */
export async function founderSessionViaApi(page: Page): Promise<void> {
  const res = await page.request.post('/api/portal/login', {
    data: { email: FOUNDER.email, password: FOUNDER.password },
  })
  expect(res.status(), `founder login failed: ${await res.text()}`).toBe(200)
}

/* ─── Partners ────────────────────────────────────────────────────────────── */

/**
 * Create a partner from the Founders Hub API and return it with its code.
 *
 * Needs a founder session on the same page first — partner creation is a hub
 * action, which is the point: a partner cannot exist without one.
 */
export async function createPartner(page: Page, opts: { name?: string; discountPct?: number; code?: string } = {}) {
  /* Unique by default: the code is derived from the name, and two partners
     asking for the same stem come back without one. */
  const name = opts.name ?? `E2E Partner ${Math.random().toString(36).slice(2, 7)}`
  const email = `partner-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@e2e.test`
  const res = await page.request.post('/api/portal/partners', {
    data: { action: 'create', name, email, discountPct: opts.discountPct, code: opts.code },
  })
  expect(res.status(), `partner create failed: ${await res.text()}`).toBe(200)
  /* The hub answers with the partner, the code it minted and the terms it
     starts on — specs need all three. Note the double wrap: the route returns
     `{ ok, partner }` and the record itself is `{ partner, codes, terms }`. */
  const { partner: record } = (await res.json()) as {
    partner: {
      partner: { id: string; status: string }
      codes: Array<{ code: string; discountPct: number }>
      terms: Record<string, unknown>
    }
  }
  return { ...record, email, name, code: record.codes?.[0]?.code }
}
