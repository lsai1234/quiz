/**
 * Partner starters repository — `partner_starters` and `partner_agreements`
 * (migration v20).
 *
 * Same dialect-neutral `?`-placeholder style as every other repository here, so
 * it runs on SQLite and Postgres unchanged.
 *
 * Server-only.
 */
import crypto from 'crypto'
import { getEngine, now } from '@/lib/db/engine'
import type { Deliverable, PartnerAgreement, PartnerStarter, StarterTier } from './types'
import { STARTER_GOODS_CAP, normaliseStarterCode, starterExpiry } from './rules'
import { newStarterCode } from './generate'

interface StarterRow {
  code: string
  partner_id: string
  tier: string
  goods_cap: number
  note: string | null
  created_by: string | null
  created_at: string
  expires_at: string
  agreement_id: string | null
  claim_token: string | null
  claimed_at: string | null
  used_at: string | null
  order_id: string | null
  revoked_at: string | null
}

interface AgreementRow {
  id: string
  partner_id: string
  code: string
  version: string
  doc_hash: string
  signed_name: string
  handle: string | null
  deliverables: string
  ip: string | null
  user_agent: string | null
  signed_at: string
}

function toStarter(row: StarterRow): PartnerStarter {
  return {
    code: row.code,
    partnerId: row.partner_id,
    tier: row.tier as StarterTier,
    // `REAL` comes back as a string from some drivers. Coerced here rather than
    // at every call site — a cap compared as a string would silently pass
    // "£9" > "£140".
    goodsCap: Number(row.goods_cap),
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    agreementId: row.agreement_id,
    claimToken: row.claim_token,
    claimedAt: row.claimed_at,
    usedAt: row.used_at,
    orderId: row.order_id,
    revokedAt: row.revoked_at,
  }
}

function toAgreement(row: AgreementRow): PartnerAgreement {
  let deliverables: Deliverable[] = []
  try {
    deliverables = JSON.parse(row.deliverables) as Deliverable[]
  } catch {
    /* A malformed blob must not make the signature unreadable — the hash and
       the version are what the record turns on, and they are their own columns. */
  }
  return {
    id: row.id,
    partnerId: row.partner_id,
    code: row.code,
    version: row.version,
    docHash: row.doc_hash,
    signedName: row.signed_name,
    handle: row.handle,
    deliverables,
    ip: row.ip,
    userAgent: row.user_agent,
    signedAt: row.signed_at,
  }
}

export async function getStarter(code: string): Promise<PartnerStarter | null> {
  const db = await getEngine()
  const row = await db.get<StarterRow>('SELECT * FROM partner_starters WHERE code = ?', [
    normaliseStarterCode(code),
  ])
  return row ? toStarter(row) : null
}

/** Every starter ever issued to one partner, newest first. */
export async function listStartersForPartner(partnerId: string): Promise<PartnerStarter[]> {
  const db = await getEngine()
  const rows = await db.all<StarterRow>(
    'SELECT * FROM partner_starters WHERE partner_id = ? ORDER BY created_at DESC',
    [partnerId],
  )
  return rows.map(toStarter)
}

/** Newest first, across everybody — the hub's list. */
export async function listStarters(limit = 100): Promise<PartnerStarter[]> {
  const db = await getEngine()
  const rows = await db.all<StarterRow>('SELECT * FROM partner_starters ORDER BY created_at DESC LIMIT ?', [
    limit,
  ])
  return rows.map(toStarter)
}

/**
 * Issue a starter.
 *
 * Retries on a collision rather than trusting 40 bits blindly: an insert that
 * overwrote a live code would transfer somebody else's free stack to this
 * partner, and take theirs away mid-journey.
 */
export async function createStarter(input: {
  partnerId: string
  tier: StarterTier
  goodsCap?: number
  note?: string | null
  createdBy?: string | null
  now?: Date
}): Promise<PartnerStarter> {
  const db = await getEngine()
  const at = now()
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newStarterCode()
    if (await getStarter(code)) continue
    const record: PartnerStarter = {
      code,
      partnerId: input.partnerId,
      tier: input.tier,
      goodsCap: input.goodsCap ?? STARTER_GOODS_CAP,
      note: input.note?.trim() || null,
      createdBy: input.createdBy ?? null,
      createdAt: at,
      expiresAt: starterExpiry(input.now ?? new Date()),
      agreementId: null,
      claimToken: null,
      claimedAt: null,
      usedAt: null,
      orderId: null,
      revokedAt: null,
    }
    await db.run(
      `INSERT INTO partner_starters
         (code, partner_id, tier, goods_cap, note, created_by, created_at, expires_at,
          agreement_id, claim_token, claimed_at, used_at, order_id, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL)`,
      [
        record.code,
        record.partnerId,
        record.tier,
        record.goodsCap,
        record.note,
        record.createdBy,
        record.createdAt,
        record.expiresAt,
      ],
    )
    return record
  }
  throw new Error('Could not allocate a starter code')
}

/**
 * Record a signature and switch the starter on, in that order.
 *
 * The agreement is written FIRST. If the second statement fails we are left
 * with evidence of a promise and a code that still buys nothing, which is
 * recoverable by hand; the other order leaves a live 100%-off code with no
 * record of what was promised for it, which is not.
 *
 * `AND agreement_id IS NULL` makes it once-only: two tabs both submitting the
 * form write two agreement rows — that is fine, they are both true — but only
 * the first one is the signature the starter points at.
 */
export async function signStarter(input: {
  starter: PartnerStarter
  version: string
  docHash: string
  signedName: string
  handle?: string | null
  deliverables: Deliverable[]
  ip?: string | null
  userAgent?: string | null
}): Promise<PartnerAgreement> {
  const db = await getEngine()
  const agreement: PartnerAgreement = {
    id: crypto.randomUUID(),
    partnerId: input.starter.partnerId,
    code: input.starter.code,
    version: input.version,
    docHash: input.docHash,
    signedName: input.signedName.trim(),
    handle: input.handle?.trim() || null,
    deliverables: input.deliverables,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    signedAt: now(),
  }
  await db.run(
    `INSERT INTO partner_agreements
       (id, partner_id, code, version, doc_hash, signed_name, handle, deliverables, ip, user_agent, signed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      agreement.id,
      agreement.partnerId,
      agreement.code,
      agreement.version,
      agreement.docHash,
      agreement.signedName,
      agreement.handle,
      JSON.stringify(agreement.deliverables),
      agreement.ip,
      agreement.userAgent,
      agreement.signedAt,
    ],
  )
  await db.run('UPDATE partner_starters SET agreement_id = ? WHERE code = ? AND agreement_id IS NULL', [
    agreement.id,
    agreement.code,
  ])
  return agreement
}

export async function getAgreement(id: string): Promise<PartnerAgreement | null> {
  const db = await getEngine()
  const row = await db.get<AgreementRow>('SELECT * FROM partner_agreements WHERE id = ?', [id])
  return row ? toAgreement(row) : null
}

/** Everything one partner has signed, newest first. Append-only, so this is a history. */
export async function listAgreementsForPartner(partnerId: string): Promise<PartnerAgreement[]> {
  const db = await getEngine()
  const rows = await db.all<AgreementRow>(
    'SELECT * FROM partner_agreements WHERE partner_id = ? ORDER BY signed_at DESC',
    [partnerId],
  )
  return rows.map(toAgreement)
}

/**
 * Take the starter, or find out another tab has.
 *
 * `WHERE claim_token IS NULL` is the lock, and `AND agreement_id IS NOT NULL`
 * is the gate — a starter that has not been signed for cannot be claimed even
 * by a caller that skipped the checks, so the promise is enforced by the same
 * statement that enforces single use rather than by remembering to ask.
 *
 * The read-back decides the race: `SqlEngine.run` reports no row count on
 * either engine, so the only way to know whether this UPDATE was the one that
 * landed is to look at whose token is in the column.
 */
export async function claimStarter(code: string): Promise<string | null> {
  const db = await getEngine()
  const token = crypto.randomBytes(16).toString('hex')
  await db.run(
    `UPDATE partner_starters SET claim_token = ?, claimed_at = ?
      WHERE code = ? AND claim_token IS NULL AND agreement_id IS NOT NULL`,
    [token, now(), normaliseStarterCode(code)],
  )
  const row = await db.get<{ claim_token: string | null }>(
    'SELECT claim_token FROM partner_starters WHERE code = ?',
    [normaliseStarterCode(code)],
  )
  return row?.claim_token === token ? token : null
}

/** Hand it back after a checkout that claimed it and then failed. */
export async function releaseStarter(code: string, token: string): Promise<void> {
  const db = await getEngine()
  await db.run(
    'UPDATE partner_starters SET claim_token = NULL, claimed_at = NULL WHERE code = ? AND claim_token = ?',
    [normaliseStarterCode(code), token],
  )
}

/**
 * Turn a claim into a redemption, against the order that spent it.
 *
 * `AND claim_token = ?` so a caller cannot spend a starter on somebody else's
 * claim — the guard that makes the claim mean anything.
 */
export async function markStarterUsed(code: string, token: string, orderId: string): Promise<void> {
  const db = await getEngine()
  await db.run('UPDATE partner_starters SET used_at = ?, order_id = ? WHERE code = ? AND claim_token = ?', [
    now(),
    orderId,
    normaliseStarterCode(code),
    token,
  ])
}

/** Kill a starter by hand. Irreversible on purpose: issue another instead. */
export async function revokeStarter(code: string): Promise<void> {
  const db = await getEngine()
  await db.run('UPDATE partner_starters SET revoked_at = ? WHERE code = ? AND revoked_at IS NULL', [
    now(),
    normaliseStarterCode(code),
  ])
}
