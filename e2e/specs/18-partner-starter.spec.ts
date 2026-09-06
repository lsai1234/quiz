import { test, expect } from '@playwright/test'
import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { completeQuiz } from '../support/quiz'

/**
 * A micro-influencer partner claiming their free stack.
 *
 * The journey the programme is sold on: tap a link in a DM, read what you are
 * agreeing to post, put your name at the bottom, take the quiz, and the stack
 * comes out free. No password, no code, no card.
 *
 * Every step of that is a place somebody drops out, so each one is pinned here.
 * Three things were removed to get to it, and each has an assertion: a password
 * form in front of a free box, a code to carry across a ninety-second quiz, and
 * a Complete depth nobody in this journey can buy.
 *
 * The starter code still exists in the database as the row's identity. It must
 * never reach a screen — a gift is not a discount somebody types.
 */

const DB = process.env.DATABASE_PATH ?? '.data/e2e.db'

/**
 * A partner, an unsigned starter and a live invite — what a founder sets up.
 *
 * Everything is keyed on a fresh random suffix rather than the test's name: the
 * e2e database is not rebuilt between runs, and a fixed id collides with
 * yesterday's row on `partners.email` the second time the suite is run.
 */
function seed(label: string) {
  const db = new Database(DB)
  /*
    The code is built from the RANDOM half alone, not from the label.

    `looksLikeStarterCode` takes exactly 8 symbols, and a label of eight
    characters or more ("unsigned") filled all of them — so every run of that
    test minted the same code and collided on the primary key the second time.
  */
  const random = Math.random().toString(36).slice(2, 10).toUpperCase().replace(/[^0-9A-Z]/g, '')
  const suffix = `${label}${random}`
  const id = `ptnr_e2e_${suffix}`
  const code = `PS-${random.padEnd(8, 'X').slice(0, 8)}`
  /* `SARAH` + the rate — what `suggestCode` builds, at the 25% the programme runs on. */
  const publicCode = `SARAH${random.slice(0, 4)}25`
  const at = new Date().toISOString()
  const starterExpiry = new Date(Date.now() + 21 * 86_400_000).toISOString()
  const inviteExpiry = new Date(Date.now() + 7 * 86_400_000).toISOString()

  /*
    The token is the credential, and only its SHA-256 is stored — so the test
    mints one the way `createInviteToken` does and keeps the raw half, exactly
    as a founder's browser does when the hub hands them a link.
  */
  const raw = `e2e-${suffix}-${Math.random().toString(36).slice(2)}`
  const hash = createHash('sha256').update(raw).digest('hex')

  db.prepare(
    `INSERT INTO partners (id, email, name, password_hash, status, data, created_at, updated_at)
     VALUES (?, ?, ?, NULL, 'invited', '{}', ?, ?)`,
  ).run(id, `${suffix}@e2e.invalid`, 'Alex Morgan', at, at)

  db.prepare(
    `INSERT INTO partner_terms (id, partner_id, first_order_pct, renewal_pct, renewal_months, payout, effective_from, note, created_by, created_at)
     VALUES (?, ?, '0.15', '0.05', '3', ?, ?, 'Standard programme terms.', NULL, ?)`,
  ).run(
    `pt_e2e_${suffix}`,
    id,
    JSON.stringify({ cadence: 'monthly', minimum: 25, selfBilled: true, chargesVat: false }),
    at,
    at,
  )

  /*
    Their public code, minted alongside the account in the real flow
    (`createPartner` makes the record, the code and the opening terms in one
    call). Seeded here because the panel is supposed to hand it back the moment
    they sign — that is the thing they have just agreed to post.
  */
  db.prepare(
    `INSERT INTO partner_codes (code, partner_id, discount_pct, terms, status, created_at)
     VALUES (?, ?, '0.25', ?, 'active', ?)`,
  ).run(
    publicCode,
    id,
    JSON.stringify({ firstOrderOnly: true, maxUses: null, uses: 0, startsAt: null, endsAt: null, minSpend: null }),
    at,
  )

  db.prepare(
    `INSERT INTO partner_starters (code, partner_id, tier, goods_cap, note, created_by, created_at, expires_at,
       agreement_id, claim_token, claimed_at, used_at, order_id, revoked_at)
     VALUES (?, ?, 'performance', 140, 'e2e', NULL, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL)`,
  ).run(code, id, at, starterExpiry)

  db.prepare(
    `INSERT INTO partner_invites (token_hash, partner_id, kind, expires_at, used_at, created_at)
     VALUES (?, ?, 'invite', ?, NULL, ?)`,
  ).run(hash, id, inviteExpiry, at)

  db.close()
  return { id, code, publicCode, token: raw }
}

/**
 * A live partner session, without going through the signing that normally
 * creates one — so the "signed in but has NOT signed the agreement" state can
 * be reached at all. Only the SHA-256 of the token is stored, exactly as
 * `startPartnerSession` writes it.
 */
function signIn(partnerId: string): string {
  const db = new Database(DB)
  const raw = `sess-${Math.random().toString(36).slice(2)}`
  db.prepare(
    `INSERT INTO partner_sessions (token_hash, partner_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(
    createHash('sha256').update(raw).digest('hex'),
    partnerId,
    new Date(Date.now() + 30 * 86_400_000).toISOString(),
    new Date().toISOString(),
  )
  db.close()
  return raw
}

/** The newest order in the database, for asserting what was actually charged. */
function lastOrder(): {
  total: number
  starterCode: string | null
  email: string | null
  address: { line1?: string; postcode?: string } | null
} | null {
  const db = new Database(DB)
  const row = db.prepare('SELECT data FROM orders ORDER BY created_at DESC LIMIT 1').get() as
    | { data: string }
    | undefined
  db.close()
  if (!row) return null
  const parsed = JSON.parse(row.data) as {
    total: number
    starterCode?: string | null
    email?: string | null
    shippingAddress?: { line1?: string; postcode?: string } | null
  }
  return {
    total: parsed.total,
    starterCode: parsed.starterCode ?? null,
    email: parsed.email ?? null,
    address: parsed.shippingAddress ?? null,
  }
}

function read(code: string) {
  const db = new Database(DB)
  const row = db
    .prepare('SELECT agreement_id, used_at, order_id FROM partner_starters WHERE code = ?')
    .get(code) as { agreement_id: string | null; used_at: string | null; order_id: string | null } | undefined
  const agreement = db
    .prepare('SELECT signed_name, handle, version, doc_hash FROM partner_agreements WHERE code = ?')
    .get(code) as { signed_name: string; handle: string | null; version: string; doc_hash: string } | undefined
  db.close()
  return { row, agreement }
}

test('a partner claims their stack from a link, with no account and nothing to type', async ({ page }) => {
  const { code, publicCode, token } = seed('claim')

  // ── The link ──────────────────────────────────────────────────────────────
  await page.goto(`/partner/claim?token=${encodeURIComponent(token)}`)

  // What they were promised, and what they are being asked for. Not a password.
  await expect(page.getByText(/your balanced stack, on us/i)).toBeVisible()
  // `.first()` because the ask appears twice on purpose: once in the summary
  // list, and once inside the agreement itself. Both are meant to be there.
  await expect(page.getByText(/one tiktok in launch week/i).first()).toBeVisible()
  await expect(page.getByRole('textbox', { name: /password/i })).toHaveCount(0)

  // The code is never on screen, before or after signing. It is the row's
  // identity, not something a partner is asked to handle.
  await expect(page.getByText(code)).toHaveCount(0)

  // ── The signature ─────────────────────────────────────────────────────────
  await page.getByRole('textbox', { name: /your full name/i }).fill('Alex Morgan')
  await page.getByRole('textbox', { name: /where you'll post/i }).fill('@alexmoves')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /sign and unlock/i }).click()

  await expect(page.getByText(/press the button and take the quiz/i)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(code)).toHaveCount(0)

  // Recorded, and recorded as what the SERVER served — the hash is the point of
  // the record, and a blank one is a signature against nothing.
  const signed = read(code)
  expect(signed.agreement?.signed_name).toBe('Alex Morgan')
  expect(signed.agreement?.handle).toBe('@alexmoves')
  expect(String(signed.agreement?.doc_hash)).toHaveLength(64)

  /*
    ── The job, handed over at the moment they agree to it ───────────────────
    They have just promised a TikTok and two stories carrying a code and a
    link. The journey used to end on "here is your free stack" and go quiet
    about both, leaving somebody with nothing to put in the posts they had
    signed up to make.
  */
  await expect(page.getByText(publicCode).first()).toBeVisible()
  await expect(page.getByText(new RegExp(`/\\?ref=${publicCode}`))).toBeVisible()
  await expect(page.getByRole('link', { name: /your assets/i })).toBeVisible()

  // ── The quiz ──────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: /claim my free stack/i }).click()
  await expect(page).toHaveURL(/\/$|\/\?/)

  await completeQuiz(page)

  /*
    The reveal knows this is a claim without being told by the customer. No
    code was typed and none is on screen — the tab carries an intent and the
    session says whose.
  */
  await expect(page.getByText(/your free starter stack/i).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(code)).toHaveCount(0)

  // The price says so, in both places that state a total. A screen showing £96
  // against an order that costs nothing is a receipt that disagrees with the
  // charge, whichever way it disagrees.
  await expect(page.getByText(/to pay/i).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /place my free order/i }).first()).toBeVisible()

  /*
    Two depths, never three. Complete is not on offer in this journey, and it
    is not planned — so the selector must not be showing it.
  */
  await expect(page.getByText(/^Complete$/)).toHaveCount(0)

  // And no subscription: a starter buys one box, and a free plan would renew
  // free long after the starter itself had expired.
  await expect(page.getByRole('button', { name: /start subscription/i })).toHaveCount(0)

  /*
    ── Where it is going ─────────────────────────────────────────────────────
    A free order never reaches Stripe, which is where every other journey
    collects an address. Without this step the box is raised with nowhere to go
    and the fulfilment queue holds it as unshippable — which is exactly how the
    first version of this journey shipped.
  */
  await page.getByRole('button', { name: /place my free order/i }).first().click()

  /*
    Scoped to the FORM, not `.last()`.

    The sticky checkout bar is portalled to the end of the document, so it —
    not the form's submit — is the last "Place my free order" in the DOM.
    Clicking that just reopens the form it is already looking at, which is a
    test that watches nothing happen and then blames the feature.
  */
  const form = page.locator('form', { hasText: /where shall we send it/i })
  await expect(form).toBeVisible()
  await form.getByLabel(/full name/i).fill('Alex Morgan')
  await form.getByLabel('Address', { exact: true }).fill('12 Example Street')
  await form.getByLabel(/town or city/i).fill('Manchester')
  await form.getByLabel(/postcode/i).fill('M1 2AB')
  await form.getByLabel(/^email$/i).fill('alex@example.invalid')

  const submit = form.getByRole('button', { name: /place my free order/i })
  await expect(submit).toBeEnabled()
  await submit.click()

  /*
    The real success heading, not a loose regex.

    The first version of this waited for /order|confirmed|thank/ — which matched
    text already on the reveal, passed instantly, and read the database before
    the order had been raised. A wait that does not wait is worse than no wait:
    it fails on timing and looks like a broken feature.
  */
  await expect(page.getByText(/your stack is on its way/i)).toBeVisible({ timeout: 30_000 })

  // Polled, because the screen changes on the response and the row is written
  // just before it — the two are close enough to race on a slow machine.
  await expect.poll(() => read(code).row?.used_at, { timeout: 15_000 }).not.toBeNull()
  expect(read(code).row?.order_id).not.toBeNull()

  // The box has somewhere to go and somebody to tell. Without both, the
  // fulfilment queue treats the order as blocked and nothing can be sent — and
  // that is exactly how the first version of this journey shipped.
  const placed = lastOrder()
  expect(placed?.total).toBe(0)
  expect(placed?.address?.line1).toBe('12 Example Street')
  expect(placed?.address?.postcode).toBe('M1 2AB')
  expect(placed?.email).toBe('alex@example.invalid')
})

/**
 * The claim flag is an INTENT, not a credential — and the screen knows it.
 *
 * `sessionStorage` is writable by anyone with devtools, and a real partner can
 * hold the flag honestly while their session has quietly gone (another device,
 * a cleared cookie, thirty days). So the flag decides whether to ASK, and the
 * server decides the answer.
 *
 * The first version of this shipped without that check, and this test is what
 * caught it: the reveal showed £0.00 and "Place my free order" to somebody the
 * checkout then charged £93.99. The money was right and the screen was a lie,
 * which is the worse half.
 */
test('the claim flag alone buys nothing, and promises nothing on screen', async ({ page }) => {
  const { code } = seed('flagonly')

  await page.goto('/')
  await page.evaluate(() => sessionStorage.setItem('chrgd.claiming-starter', '1'))
  await completeQuiz(page)

  // No session, so there is no claim — and the screen says the true thing.
  await expect(page.getByRole('button', { name: /place my free order/i })).toHaveCount(0)
  await expect(page.getByText(/your free starter stack/i)).toHaveCount(0)

  const cta = page.getByRole('button', { name: /continue to checkout|start subscription/i }).first()
  await cta.scrollIntoViewIfNeeded()
  await cta.click()

  await expect(page.getByText(/your stack is on its way|you're subscribed/i)).toBeVisible({ timeout: 30_000 })

  // Charged a real price, and nobody's starter spent on it.
  await expect.poll(() => lastOrder()?.total ?? 0, { timeout: 15_000 }).toBeGreaterThan(0)
  expect(lastOrder()?.starterCode ?? null).toBeNull()
  expect(read(code).row?.used_at ?? null).toBeNull()
})

/**
 * Signed IN is not signed FOR.
 *
 * A partner with a live session and no signed agreement is the state the whole
 * design turns on: they are identified, the starter exists, and it still buys
 * nothing. There is no button for them to press — and if they reach the quiz
 * with the flag set anyway, the server declines to confirm it, so they get the
 * ordinary reveal at the ordinary price rather than a promise we would break.
 */
test('a partner who has not signed the agreement is not shown a free stack', async ({ page }) => {
  const { id, code, token } = seed('nosign')

  await page.goto(`/partner/claim?token=${encodeURIComponent(token)}`)
  // The offer is there; the way to take it is not, because nothing is signed.
  await expect(page.getByText(/sign to unlock/i)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: /claim my free stack/i })).toHaveCount(0)

  const session = signIn(id)
  await page.context().addCookies([{ name: 'partner_session', value: session, url: page.url() }])

  await page.goto('/')
  await page.evaluate(() => sessionStorage.setItem('chrgd.claiming-starter', '1'))
  await completeQuiz(page)

  // Identified, and still not claimable. The screen promises nothing.
  await expect(page.getByRole('button', { name: /place my free order/i })).toHaveCount(0)
  await expect(page.getByText(/your free starter stack/i)).toHaveCount(0)

  // And the starter is untouched, still there to be claimed once they sign.
  expect(read(code).row?.used_at ?? null).toBeNull()
  expect(read(code).row?.agreement_id ?? null).toBeNull()
})
