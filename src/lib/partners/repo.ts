/**
 * Partners repository — the `partners`, `partner_codes` and `partner_terms`
 * tables (migration v9).
 *
 * Mirrors the dialect-neutral `?`-placeholder style of the other repositories so
 * it runs on SQLite and Postgres unchanged. Numbers are stored as TEXT, like
 * every other money/rate column in this schema, and parsed on read — the DDL is
 * written in the dialect intersection deliberately.
 *
 * Server-only.
 */
import crypto from 'crypto'
import { getEngine, now } from '@/lib/db/engine'
import type {
  CodeStatus,
  CodeTerms,
  Partner,
  PartnerCode,
  PartnerCommission,
  PartnerData,
  PartnerPayout,
  PartnerStatus,
  PartnerTerms,
  PayoutTerms,
} from './types'

const num = (v: string | number): number => (typeof v === 'number' ? v : Number.parseFloat(v))

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

// ─── Partners ─────────────────────────────────────────────────────────────────

interface PartnerRow {
  id: string
  email: string
  name: string
  password_hash: string | null
  status: string
  data: string
  created_at: string
  updated_at: string
}

function toPartner(row: PartnerRow): Partner {
  let data: PartnerData = {}
  try {
    data = JSON.parse(row.data) as PartnerData
  } catch {
    /* a malformed blob must not hide the partner */
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status as PartnerStatus,
    data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function createPartner(input: {
  email: string
  name: string
  data?: PartnerData
}): Promise<Partner> {
  const db = await getEngine()
  const at = now()
  const partner: Partner = {
    id: newId('ptnr'),
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    // No password yet — they set one from an invite. `invited` is what tells
    // the hub they have never signed in.
    status: 'invited',
    data: input.data ?? {},
    createdAt: at,
    updatedAt: at,
  }
  await db.run(
    `INSERT INTO partners (id, email, name, password_hash, status, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [partner.id, partner.email, partner.name, null, partner.status, JSON.stringify(partner.data), at, at],
  )
  return partner
}

export async function getPartner(id: string): Promise<Partner | null> {
  const db = await getEngine()
  const row = await db.get<PartnerRow>('SELECT * FROM partners WHERE id = ?', [id])
  return row ? toPartner(row) : null
}

export async function getPartnerByEmail(email: string): Promise<Partner | null> {
  const db = await getEngine()
  const row = await db.get<PartnerRow>('SELECT * FROM partners WHERE email = ?', [email.trim().toLowerCase()])
  return row ? toPartner(row) : null
}

export async function listPartners(): Promise<Partner[]> {
  const db = await getEngine()
  const rows = await db.all<PartnerRow>('SELECT * FROM partners ORDER BY created_at DESC')
  return rows.map(toPartner)
}

export async function updatePartner(
  id: string,
  patch: { name?: string; status?: PartnerStatus; data?: PartnerData },
): Promise<void> {
  const existing = await getPartner(id)
  if (!existing) return
  const db = await getEngine()
  await db.run('UPDATE partners SET name = ?, status = ?, data = ?, updated_at = ? WHERE id = ?', [
    patch.name ?? existing.name,
    patch.status ?? existing.status,
    JSON.stringify(patch.data ?? existing.data),
    now(),
    id,
  ])
}

/** Store a password hash and move an invited partner to active. */
export async function setPartnerPassword(id: string, passwordHash: string): Promise<void> {
  const db = await getEngine()
  await db.run(
    `UPDATE partners SET password_hash = ?, status = CASE WHEN status = 'invited' THEN 'active' ELSE status END,
     updated_at = ? WHERE id = ?`,
    [passwordHash, now(), id],
  )
}

export async function getPartnerPasswordHash(id: string): Promise<string | null> {
  const db = await getEngine()
  const row = await db.get<{ password_hash: string | null }>('SELECT password_hash FROM partners WHERE id = ?', [id])
  return row?.password_hash ?? null
}

// ─── Codes ────────────────────────────────────────────────────────────────────

interface CodeRow {
  code: string
  partner_id: string
  discount_pct: string
  terms: string
  status: string
  created_at: string
}

function toCode(row: CodeRow): PartnerCode {
  return {
    code: row.code,
    partnerId: row.partner_id,
    discountPct: num(row.discount_pct),
    terms: JSON.parse(row.terms) as CodeTerms,
    status: row.status as CodeStatus,
    createdAt: row.created_at,
  }
}

export async function createCode(input: {
  code: string
  partnerId: string
  discountPct: number
  terms: CodeTerms
}): Promise<PartnerCode> {
  const db = await getEngine()
  const at = now()
  await db.run(
    `INSERT INTO partner_codes (code, partner_id, discount_pct, terms, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.code, input.partnerId, String(input.discountPct), JSON.stringify(input.terms), 'active', at],
  )
  return { ...input, status: 'active', createdAt: at }
}

export async function getCode(code: string): Promise<PartnerCode | null> {
  const db = await getEngine()
  const row = await db.get<CodeRow>('SELECT * FROM partner_codes WHERE code = ?', [code])
  return row ? toCode(row) : null
}

export async function listCodes(partnerId: string): Promise<PartnerCode[]> {
  const db = await getEngine()
  const rows = await db.all<CodeRow>('SELECT * FROM partner_codes WHERE partner_id = ? ORDER BY created_at DESC', [
    partnerId,
  ])
  return rows.map(toCode)
}

export async function listAllCodes(): Promise<PartnerCode[]> {
  const db = await getEngine()
  return (await db.all<CodeRow>('SELECT * FROM partner_codes')).map(toCode)
}

export async function updateCode(
  code: string,
  patch: { discountPct?: number; terms?: CodeTerms; status?: CodeStatus },
): Promise<void> {
  const existing = await getCode(code)
  if (!existing) return
  const db = await getEngine()
  await db.run('UPDATE partner_codes SET discount_pct = ?, terms = ?, status = ? WHERE code = ?', [
    String(patch.discountPct ?? existing.discountPct),
    JSON.stringify(patch.terms ?? existing.terms),
    patch.status ?? existing.status,
    code,
  ])
}

// ─── Terms ────────────────────────────────────────────────────────────────────

interface TermsRow {
  id: string
  partner_id: string
  first_order_pct: string
  renewal_pct: string
  renewal_months: string
  payout: string
  effective_from: string
  note: string | null
  created_by: string | null
  created_at: string
}

function toTerms(row: TermsRow): PartnerTerms {
  return {
    id: row.id,
    partnerId: row.partner_id,
    firstOrderPct: num(row.first_order_pct),
    renewalPct: num(row.renewal_pct),
    renewalMonths: num(row.renewal_months),
    payout: JSON.parse(row.payout) as PayoutTerms,
    effectiveFrom: row.effective_from,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

/** Append a terms row. Never updates — that is the whole point of the table. */
export async function addTerms(
  input: Omit<PartnerTerms, 'id' | 'createdAt'>,
): Promise<PartnerTerms> {
  const db = await getEngine()
  const at = now()
  const terms: PartnerTerms = { ...input, id: newId('ptrm'), createdAt: at }
  await db.run(
    `INSERT INTO partner_terms
       (id, partner_id, first_order_pct, renewal_pct, renewal_months, payout, effective_from, note, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      terms.id,
      terms.partnerId,
      String(terms.firstOrderPct),
      String(terms.renewalPct),
      String(terms.renewalMonths),
      JSON.stringify(terms.payout),
      terms.effectiveFrom,
      terms.note,
      terms.createdBy,
      at,
    ],
  )
  return terms
}

export async function listTerms(partnerId: string): Promise<PartnerTerms[]> {
  const db = await getEngine()
  const rows = await db.all<TermsRow>(
    'SELECT * FROM partner_terms WHERE partner_id = ? ORDER BY effective_from DESC',
    [partnerId],
  )
  return rows.map(toTerms)
}

// ─── Commissions ──────────────────────────────────────────────────────────────

interface CommissionRow {
  id: string
  partner_id: string
  order_id: string
  kind: string
  net_basis: string
  rate: string
  amount: string
  state: string
  confirm_after: string
  payout_id: string | null
  created_at: string
}

function toCommission(row: CommissionRow): PartnerCommission {
  return {
    id: row.id,
    partnerId: row.partner_id,
    orderId: row.order_id,
    kind: row.kind as PartnerCommission['kind'],
    netBasis: num(row.net_basis),
    rate: num(row.rate),
    amount: num(row.amount),
    state: row.state as PartnerCommission['state'],
    confirmAfter: row.confirm_after,
    payoutId: row.payout_id,
    createdAt: row.created_at,
  }
}

/**
 * Insert one accrual, or do nothing if this order already has one of this kind.
 *
 * Returns null when it was already there. Idempotency is enforced by the unique
 * index on `(order_id, kind)` rather than by checking first: Stripe delivers
 * webhooks more than once and two of them can land at the same moment, so a
 * read-then-write would still double-pay under a race. The database is the only
 * thing that can decide this.
 */
export async function insertCommission(
  input: Omit<PartnerCommission, 'id' | 'createdAt'>,
): Promise<PartnerCommission | null> {
  const db = await getEngine()
  const at = now()
  const row: PartnerCommission = { ...input, id: newId('pcom'), createdAt: at }
  try {
    await db.run(
      `INSERT INTO partner_commissions
         (id, partner_id, order_id, kind, net_basis, rate, amount, state, confirm_after, payout_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.partnerId,
        row.orderId,
        row.kind,
        String(row.netBasis),
        String(row.rate),
        String(row.amount),
        row.state,
        row.confirmAfter,
        row.payoutId,
        at,
      ],
    )
    return row
  } catch (err) {
    // A unique-constraint violation is the expected outcome of a redelivered
    // webhook, not a fault. Anything else is.
    if (isUniqueViolation(err)) return null
    throw err
  }
}

function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /unique|duplicate key/i.test(message)
}

export async function listCommissions(partnerId: string, limit = 500): Promise<PartnerCommission[]> {
  const db = await getEngine()
  const rows = await db.all<CommissionRow>(
    `SELECT * FROM partner_commissions WHERE partner_id = ? ORDER BY created_at DESC LIMIT ${clampLimit(limit)}`,
    [partnerId],
  )
  return rows.map(toCommission)
}

export async function listCommissionsForOrder(orderId: string): Promise<PartnerCommission[]> {
  const db = await getEngine()
  const rows = await db.all<CommissionRow>('SELECT * FROM partner_commissions WHERE order_id = ?', [orderId])
  return rows.map(toCommission)
}

/** Accruals whose return window has passed — the daily job's work list. */
export async function listDueForConfirmation(asOf: string, limit = 500): Promise<PartnerCommission[]> {
  const db = await getEngine()
  const rows = await db.all<CommissionRow>(
    `SELECT * FROM partner_commissions WHERE state = 'accrued' AND confirm_after <= ?
      ORDER BY confirm_after ASC LIMIT ${clampLimit(limit)}`,
    [asOf],
  )
  return rows.map(toCommission)
}

export async function listConfirmed(partnerId: string): Promise<PartnerCommission[]> {
  const db = await getEngine()
  const rows = await db.all<CommissionRow>(
    "SELECT * FROM partner_commissions WHERE partner_id = ? AND state = 'confirmed' ORDER BY created_at ASC",
    [partnerId],
  )
  return rows.map(toCommission)
}

/**
 * Move a commission to a new state, but only from the state it is allowed to
 * leave.
 *
 * Guarded in SQL rather than by reading first, for the same reason the insert
 * is: two webhooks can arrive together. A `paid` row must never be quietly
 * reversed back into the balance, and a `reversed` one must never be confirmed.
 */
export async function setCommissionState(
  id: string,
  from: PartnerCommission['state'][],
  to: PartnerCommission['state'],
  payoutId: string | null = null,
): Promise<boolean> {
  if (from.length === 0) return false
  const db = await getEngine()
  const placeholders = from.map(() => '?').join(', ')
  await db.run(
    `UPDATE partner_commissions SET state = ?, payout_id = COALESCE(?, payout_id)
      WHERE id = ? AND state IN (${placeholders})`,
    [to, payoutId, id, ...from],
  )
  // The engine's `run` reports no row count, so read the state back. The GUARD
  // is in the WHERE clause above and holds regardless — this is only how the
  // caller finds out whether it was the one that moved it, for reporting.
  const row = await db.get<{ state: string }>('SELECT state FROM partner_commissions WHERE id = ?', [id])
  return row?.state === to
}

// ─── Payouts ──────────────────────────────────────────────────────────────────

interface PayoutRow {
  id: string
  partner_id: string
  period: string
  amount: string
  state: string
  reference: string | null
  created_at: string
}

function toPayout(row: PayoutRow): PartnerPayout {
  return {
    id: row.id,
    partnerId: row.partner_id,
    period: row.period,
    amount: num(row.amount),
    state: row.state as PartnerPayout['state'],
    reference: row.reference,
    createdAt: row.created_at,
  }
}

export async function createPayout(input: {
  partnerId: string
  period: string
  amount: number
}): Promise<PartnerPayout> {
  const db = await getEngine()
  const at = now()
  const payout: PartnerPayout = { ...input, id: newId('ppay'), state: 'due', reference: null, createdAt: at }
  await db.run(
    'INSERT INTO partner_payouts (id, partner_id, period, amount, state, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [payout.id, payout.partnerId, payout.period, String(payout.amount), payout.state, null, at],
  )
  return payout
}

/** Every commission row sitting on one payout. */
export async function listCommissionsForPayout(payoutId: string): Promise<PartnerCommission[]> {
  const db = await getEngine()
  const rows = await db.all<CommissionRow>('SELECT * FROM partner_commissions WHERE payout_id = ?', [payoutId])
  return rows.map(toCommission)
}

/**
 * Correct a payout's amount to what actually moved onto it.
 *
 * A refund landing between reading the confirmed rows and stamping them would
 * otherwise leave an invoice for more than the rows behind it — and an invoice
 * that does not equal its own lines is the kind of thing an accountant finds
 * eighteen months later.
 */
export async function setPayoutAmount(id: string, amount: number): Promise<void> {
  const db = await getEngine()
  await db.run('UPDATE partner_payouts SET amount = ? WHERE id = ?', [String(amount), id])
}

export async function markPayoutPaid(id: string, reference: string | null): Promise<void> {
  const db = await getEngine()
  await db.run("UPDATE partner_payouts SET state = 'paid', reference = ? WHERE id = ?", [reference, id])
}

export async function getPayout(id: string): Promise<PartnerPayout | null> {
  const db = await getEngine()
  const row = await db.get<PayoutRow>('SELECT * FROM partner_payouts WHERE id = ?', [id])
  return row ? toPayout(row) : null
}

/** Every payout in a period, across all partners — the run's own record. */
export async function listPayoutsForPeriod(period: string): Promise<PartnerPayout[]> {
  const db = await getEngine()
  const rows = await db.all<PayoutRow>('SELECT * FROM partner_payouts WHERE period = ? ORDER BY created_at DESC', [
    period,
  ])
  return rows.map(toPayout)
}

export async function listPayouts(partnerId: string): Promise<PartnerPayout[]> {
  const db = await getEngine()
  const rows = await db.all<PayoutRow>(
    'SELECT * FROM partner_payouts WHERE partner_id = ? ORDER BY created_at DESC LIMIT 200',
    [partnerId],
  )
  return rows.map(toPayout)
}

function clampLimit(n: number): number {
  return Math.min(Math.max(1, Math.round(n)), 1000)
}

/**
 * The earliest commission a partner has that has not been paid out yet.
 *
 * What `changeTerms` needs: new terms must not start before it, or the rate
 * stored on the ledger row and the terms the partner can read would disagree,
 * and they would be told they were on a rate they were never paid.
 *
 * Paid rows are excluded because they are settled — restating a rate behind
 * money that has already moved changes nothing about the money. Reversed rows
 * likewise: nobody is owed for them.
 */
export async function oldestUnsettledCommission(partnerId: string): Promise<string | null> {
  const db = await getEngine()
  const row = await db.get<{ created_at: string }>(
    `SELECT created_at FROM partner_commissions
      WHERE partner_id = ? AND state IN ('accrued', 'confirmed')
      ORDER BY created_at ASC LIMIT 1`,
    [partnerId],
  )
  return row?.created_at ?? null
}

// ─── Sessions & invites ───────────────────────────────────────────────────────
// The browser holds a random opaque token; only its SHA-256 hash is stored, so
// a leaked database cannot be replayed as live logins. Same shape as the
// customer realm (`lib/db/sessions.ts`), deliberately.

export async function insertSession(input: {
  tokenHash: string
  partnerId: string
  expiresAt: string
}): Promise<void> {
  const db = await getEngine()
  await db.run(
    'INSERT INTO partner_sessions (token_hash, partner_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    [input.tokenHash, input.partnerId, input.expiresAt, now()],
  )
}

/** Resolve a session hash to its partner, sweeping expired rows on the way. */
export async function partnerIdForSession(tokenHash: string): Promise<string | null> {
  const db = await getEngine()
  await db.run('DELETE FROM partner_sessions WHERE expires_at < ?', [now()])
  const row = await db.get<{ partner_id: string }>(
    'SELECT partner_id FROM partner_sessions WHERE token_hash = ? AND expires_at >= ?',
    [tokenHash, now()],
  )
  return row?.partner_id ?? null
}

export async function deleteSessionByHash(tokenHash: string): Promise<void> {
  const db = await getEngine()
  await db.run('DELETE FROM partner_sessions WHERE token_hash = ?', [tokenHash])
}

/** Drop every session a partner holds — on suspension, or a password change. */
export async function deleteSessionsFor(partnerId: string): Promise<void> {
  const db = await getEngine()
  await db.run('DELETE FROM partner_sessions WHERE partner_id = ?', [partnerId])
}

export async function insertInvite(input: {
  tokenHash: string
  partnerId: string
  kind: 'invite' | 'reset'
  expiresAt: string
}): Promise<void> {
  const db = await getEngine()
  await db.run(
    'INSERT INTO partner_invites (token_hash, partner_id, kind, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [input.tokenHash, input.partnerId, input.kind, input.expiresAt, null, now()],
  )
}

/** How many links this partner has been sent since `sinceIso` — the reset throttle. */
export async function countInvitesSince(
  partnerId: string,
  sinceIso: string,
  kind?: 'invite' | 'reset',
): Promise<number> {
  const db = await getEngine()
  const row = kind
    ? await db.get<{ n: number | string }>(
        'SELECT COUNT(*) AS n FROM partner_invites WHERE partner_id = ? AND created_at >= ? AND kind = ?',
        [partnerId, sinceIso, kind],
      )
    : await db.get<{ n: number | string }>(
        'SELECT COUNT(*) AS n FROM partner_invites WHERE partner_id = ? AND created_at >= ?',
        [partnerId, sinceIso],
      )
  return Number(row?.n ?? 0)
}

/**
 * Retire every outstanding link of a kind, so only the newest one works.
 *
 * Stamped rather than deleted: an unused link is still part of the record of
 * what was sent, and deleting it would take the attempt out of the throttle's
 * count as well. `used_at IS NULL` is the only test for usability.
 *
 * Scoped to `reset` by its only caller — a self-serve reset must not quietly
 * void the onboarding invite a founder sent last week.
 */
export async function invalidateInvites(partnerId: string, kind: 'invite' | 'reset'): Promise<void> {
  const db = await getEngine()
  await db.run(
    'UPDATE partner_invites SET used_at = ? WHERE partner_id = ? AND kind = ? AND used_at IS NULL',
    [`superseded#${now()}`, partnerId, kind],
  )
}

/** An unused, unexpired invite, or null. Single-use is enforced by `used_at`. */
export async function findUsableInvite(
  tokenHash: string,
): Promise<{ partnerId: string; kind: string; expiresAt: string } | null> {
  const db = await getEngine()
  const row = await db.get<{ partner_id: string; kind: string; expires_at: string }>(
    'SELECT partner_id, kind, expires_at FROM partner_invites WHERE token_hash = ? AND used_at IS NULL AND expires_at >= ?',
    [tokenHash, now()],
  )
  // `expires_at` comes back so a screen can COUNT DOWN rather than only find
  // out at the moment the link stops working. A partner who has a week to set
  // a password should be able to see the week.
  return row ? { partnerId: row.partner_id, kind: row.kind, expiresAt: row.expires_at } : null
}

/**
 * Burn an invite, and report whether THIS caller was the one that burnt it.
 *
 * `WHERE used_at IS NULL` is what makes it single-use, and that guard is in SQL
 * because two tabs submitting the same link at once must not both succeed.
 * The engine reports no row count, so the winner is identified by stamping a
 * value unique to this call and reading back whose stamp survived — otherwise
 * both callers would see a non-null `used_at` and both believe they won.
 */
export async function consumeInvite(tokenHash: string): Promise<boolean> {
  const db = await getEngine()
  // Unique per call, and still a readable timestamp — the suffix is only there
  // to tell two simultaneous callers apart.
  const stamp = `${now()}#${crypto.randomUUID()}`
  await db.run('UPDATE partner_invites SET used_at = ? WHERE token_hash = ? AND used_at IS NULL', [
    stamp,
    tokenHash,
  ])
  const row = await db.get<{ used_at: string | null }>(
    'SELECT used_at FROM partner_invites WHERE token_hash = ?',
    [tokenHash],
  )
  return row?.used_at === stamp
}
