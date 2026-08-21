/**
 * Marketing consent — the evidence, and the answer it produces.
 *
 * Server-only. Two things live here and they are deliberately separate:
 *
 *  • **The record.** Append-only, one row per act, carrying the exact sentence
 *    the person was shown (version + SHA-256 of the text), where they were shown
 *    it, and the IP and browser that submitted it. This is what answers "prove
 *    they agreed", which is the question a complaint actually asks — UK GDPR
 *    Art. 7(1) puts the burden of proof on us, not on them.
 *
 *  • **The answer.** `mayMarket(email)` — whether we may send this address
 *    marketing right now. It reads the suppression list FIRST, because an
 *    opt-out beats any opt-in whenever it happened: someone who opted out and
 *    later ticked a box on a different page has still, most recently, told us
 *    something, and the safe reading of two conflicting signals is the one that
 *    sends less email.
 *
 * The suppression list itself is the one that already exists in
 * `lib/notify/marketing.ts` — the same tokens that appear in the footer of every
 * receipt. Sharing it is the point: an opt-out from a receipt has to stop the
 * quiz list too, and it can only do that if there is one list.
 */
import { createHash, randomUUID } from 'crypto'
import { getEngine, now } from '@/lib/db/engine'
import { marketingSuppressed } from '@/lib/notify/marketing'
import { MARKETING_CONSENT_STATEMENT, MARKETING_CONSENT_VERSION } from '@/lib/legal/content'
import type { ConsentAction, ConsentBasis, MarketingConsentRecord } from './types'

/** Trimmed and lowercased. The identity of a lead, everywhere. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Is this a plausible email address?
 *
 * Deliberately permissive — a regex strict enough to reject every invalid
 * address also rejects valid ones (plus-addressing, new TLDs, unicode
 * localparts), and the cost of the two mistakes is not symmetric: a bad address
 * bounces once, a rejected good one loses a customer at the moment they were
 * trying to give us their details.
 */
export function isPlausibleEmail(email: string): boolean {
  const value = normaliseEmail(email)
  return value.length >= 6 && value.length <= 254 && /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value)
}

/** SHA-256 of the statement text, so a record ties to the words, not a label. */
export function hashStatement(statement = MARKETING_CONSENT_STATEMENT): string {
  return createHash('sha256').update(statement, 'utf8').digest('hex')
}

interface Row {
  id: string
  email: string
  action: string
  basis: string
  statement_version: string | null
  statement_hash: string | null
  source: string
  ip: string | null
  user_agent: string | null
  created_at: string
}

const toRecord = (r: Row): MarketingConsentRecord => ({
  id: r.id,
  email: r.email,
  action: r.action as ConsentAction,
  basis: r.basis as ConsentBasis,
  statementVersion: r.statement_version,
  statementHash: r.statement_hash,
  source: r.source,
  ip: r.ip,
  userAgent: r.user_agent,
  createdAt: r.created_at,
})

export interface RecordConsentInput {
  email: string
  action: ConsentAction
  basis: ConsentBasis
  source: string
  ip?: string | null
  userAgent?: string | null
  /** The wording shown. Defaults to the current statement; omitted on opt-out. */
  statement?: string | null
}

/**
 * Write one act down. Never updates, never deletes — see the migration comment.
 *
 * The statement is hashed here rather than taken from the caller for the same
 * reason `lib/legal/consent.ts` re-renders the terms server-side: a client that
 * can name what it consented to can manufacture consent to something nobody saw.
 */
export async function recordMarketingConsent(
  input: RecordConsentInput,
): Promise<MarketingConsentRecord> {
  const statement =
    input.action === 'opt-in' ? (input.statement ?? MARKETING_CONSENT_STATEMENT) : null

  const record: MarketingConsentRecord = {
    id: `mkc_${randomUUID()}`,
    email: normaliseEmail(input.email),
    action: input.action,
    basis: input.basis,
    statementVersion: statement ? MARKETING_CONSENT_VERSION : null,
    statementHash: statement ? hashStatement(statement) : null,
    source: input.source,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    createdAt: now(),
  }

  const db = await getEngine()
  await db.run(
    `INSERT INTO marketing_consents
       (id, email, action, basis, statement_version, statement_hash, source, ip, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.email,
      record.action,
      record.basis,
      record.statementVersion,
      record.statementHash,
      record.source,
      record.ip,
      record.userAgent,
      record.createdAt,
    ],
  )
  return record
}

/** Everything ever recorded for an address, newest first. */
export async function consentHistory(email: string): Promise<MarketingConsentRecord[]> {
  const db = await getEngine()
  const rows = await db.all<Row>(
    `SELECT * FROM marketing_consents WHERE email = ? ORDER BY created_at DESC`,
    [normaliseEmail(email)],
  )
  return rows.map(toRecord)
}

/** The most recent opt-in, if there has ever been one. */
export async function latestOptIn(email: string): Promise<MarketingConsentRecord | null> {
  const db = await getEngine()
  const row = await db.get<Row>(
    `SELECT * FROM marketing_consents
      WHERE email = ? AND action = 'opt-in'
      ORDER BY created_at DESC`,
    [normaliseEmail(email)],
  )
  return row ? toRecord(row) : null
}

/**
 * May we send this address marketing?
 *
 * **The single answer**, for the promotional strip, the quiz list, an export and
 * any campaign — anything that asks a different question is a second list that
 * will eventually disagree with this one.
 *
 * Fails closed: an error reading either store answers "no". The cost of a false
 * no is one email we did not send; the cost of a false yes is emailing someone
 * who told us to stop.
 */
export async function mayMarket(email: string | null | undefined): Promise<boolean> {
  if (!email || !isPlausibleEmail(email)) return false
  try {
    if (await marketingSuppressed(email)) return false
    return (await latestOptIn(email)) != null
  } catch (err) {
    console.error('[audience] could not resolve marketing permission:', err)
    return false
  }
}

/** The full picture for one address, for the hub and for a data request. */
export async function consentStateOf(email: string): Promise<{
  marketable: boolean
  basis: ConsentBasis | null
  optedInAt: string | null
  suppressedAt: string | null
}> {
  const normalised = normaliseEmail(email)
  const [optIn, suppressed, history] = await Promise.all([
    latestOptIn(normalised),
    marketingSuppressed(normalised),
    consentHistory(normalised),
  ])
  const optOut = history.find((r) => r.action === 'opt-out') ?? null

  return {
    marketable: !suppressed && optIn != null,
    basis: optIn?.basis ?? null,
    optedInAt: optIn?.createdAt ?? null,
    // Suppression is the authority on whether they are out; the record is where
    // the timestamp comes from when we have one. An opt-out taken from an email
    // footer before this table existed has the first without the second.
    suppressedAt: suppressed ? (optOut?.createdAt ?? null) : null,
  }
}
