import { test, expect } from '@playwright/test'
import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { completeQuiz } from '../support/quiz'

/**
 * A micro-influencer partner claiming their free stack.
 *
 * The journey the programme is sold on: tap a link in a DM, read what you are
 * agreeing to post, put your name at the bottom, take the quiz, and the stack
 * comes out free. No password, no code to copy, no card.
 *
 * Every step of that is a place somebody drops out, so each one is pinned here.
 * The two that matter most are the ones that were removed: a password form in
 * front of a free box, and an eight-character code to carry across a
 * ninety-second quiz.
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

  // The code is NOT on screen yet — it buys nothing until this is signed, and
  // showing it invites somebody to try it and conclude we are broken.
  await expect(page.getByText(code)).toHaveCount(0)

  // ── The signature ─────────────────────────────────────────────────────────
  await page.getByRole('textbox', { name: /your full name/i }).fill('Alex Morgan')
  await page.getByRole('textbox', { name: /where you'll post/i }).fill('@alexmoves')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /sign and unlock/i }).click()

  await expect(page.getByText(code).first()).toBeVisible({ timeout: 15_000 })

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
  await page.getByRole('button', { name: /take the quiz/i }).click()
  await expect(page).toHaveURL(/\/$|\/\?/)

  await completeQuiz(page)

  /*
    The code carried itself. This is the step that was removed: they held an
    eight-character code on one page and had to get it into a box on another,
    with ninety seconds of quiz in between.
  */
  await expect(page.getByText(code).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/starter stack/i).first()).toBeVisible()

  // And the price says so, in both places that state a total. A screen showing
  // £126 against an order that costs nothing is a receipt that disagrees with
  // the charge, whichever way it disagrees.
  await expect(page.getByText(/to pay/i).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /place my free order/i }).first()).toBeVisible()

  // ── The order ─────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: /place my free order/i }).first().click()

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
})

test('the code buys nothing until it has been signed for', async ({ page }) => {
  const { code } = seed('unsigned')

  await completeQuiz(page)

  // Typed by hand, which is the only way in — a starter is deliberately never
  // picked up from a referral cookie.
  await page.getByRole('button', { name: /code/i }).first().click()
  await page.getByPlaceholder(/discount code/i).fill(code)
  await page.getByRole('button', { name: /apply/i }).click()

  await expect(page.getByText(/sign your partner agreement/i)).toBeVisible({ timeout: 15_000 })
})
