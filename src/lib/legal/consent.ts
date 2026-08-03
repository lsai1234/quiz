/**
 * Consent evidence — proving what a member agreed to, and when.
 *
 * Server-only. The one rule that shapes this module: **the client never tells us
 * what it consented to.** A browser sends a single "yes, I ticked the box" plus
 * the versions it displayed; the server decides which documents that means,
 * re-renders them from `content.ts`, and hashes the exact text it served. A
 * tampered or stale payload can't manufacture consent to something a member
 * never saw.
 *
 * Records are append-only. Nothing here updates or deletes a row — the value of
 * the table is that it's a history.
 */
import { createHash, randomUUID } from 'crypto'
import { getEngine, now } from '@/lib/db/engine'
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import {
  SETTLEMENT_TERMS_VERSION,
  TERMS_VERSION,
  checkoutDocuments,
  documentText,
  type LegalDocument,
  type LegalDocumentId,
} from './content'

/** One document as it stood when a member accepted it. */
export interface ConsentedDocument {
  id: LegalDocumentId
  version: string
  /** SHA-256 of `documentText(doc)` — ties the record to the exact wording. */
  hash: string
}

export type ConsentContext = 'checkout' | 're-consent'

export interface ConsentRecord {
  id: string
  userId: string
  context: ConsentContext
  documents: ConsentedDocument[]
  acceptedAt: string
  /** Best-effort request metadata, for evidential weight. Null when unknown. */
  ip: string | null
  userAgent: string | null
}

/** What the browser submits. Deliberately thin — it can't name its own terms. */
export interface ConsentSubmission {
  accepted: boolean
  termsVersion: string
  disclaimerVersion: string
}

export function hashDocument(doc: LegalDocument): string {
  return createHash('sha256').update(documentText(doc), 'utf8').digest('hex')
}

export function consentedDocument(doc: LegalDocument): ConsentedDocument {
  return { id: doc.id, version: doc.version, hash: hashDocument(doc) }
}

// ─── Validating a submission ──────────────────────────────────────────────────

export type ConsentError =
  /** The box wasn't ticked (or the field is missing entirely). */
  | 'not-accepted'
  /**
   * The browser displayed a version we no longer serve — only possible when the
   * documents changed mid-session, across a deploy. We reject rather than record
   * consent to text we can't reproduce, and the member re-reads the new version.
   */
  | 'stale-version'

/**
 * Check a submission against the documents currently being served.
 * Returns the documents to record, or why the submission can't be accepted.
 */
export function validateConsent(
  submission: ConsentSubmission | undefined | null,
  config: PricingConfig = getPricingConfig(),
): { ok: true; documents: ConsentedDocument[] } | { ok: false; error: ConsentError } {
  if (!submission?.accepted) return { ok: false, error: 'not-accepted' }

  const docs = checkoutDocuments(config)
  const terms = docs.find((d) => d.id === 'terms')!
  const disclaimer = docs.find((d) => d.id === 'disclaimer')!

  if (submission.termsVersion !== terms.version || submission.disclaimerVersion !== disclaimer.version) {
    return { ok: false, error: 'stale-version' }
  }
  return { ok: true, documents: docs.map(consentedDocument) }
}

export function consentErrorMessage(error: ConsentError): string {
  return error === 'not-accepted'
    ? 'Please confirm you’ve read and agree to the subscription terms and health information.'
    : 'Our terms were updated while you were here. Please review them and tick the box again.'
}

// ─── Persistence (append-only) ────────────────────────────────────────────────

interface Row {
  data: string
}

function parse(row: Row | undefined): ConsentRecord | null {
  if (!row) return null
  try {
    return JSON.parse(row.data) as ConsentRecord
  } catch {
    return null
  }
}

export interface RecordConsentInput {
  userId: string
  context: ConsentContext
  documents: ConsentedDocument[]
  ip?: string | null
  userAgent?: string | null
}

export async function recordConsent(input: RecordConsentInput): Promise<ConsentRecord> {
  const record: ConsentRecord = {
    id: `csnt_${randomUUID()}`,
    userId: input.userId,
    context: input.context,
    documents: input.documents,
    acceptedAt: now(),
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  }

  const db = await getEngine()
  await db.run(
    `INSERT INTO consents (id, user_id, context, terms_version, data, accepted_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.userId,
      record.context,
      record.documents.find((d) => d.id === 'terms')?.version ?? TERMS_VERSION,
      JSON.stringify(record),
      record.acceptedAt,
    ],
  )
  return record
}

/** Every consent a member has given, newest first. */
export async function listConsents(userId: string): Promise<ConsentRecord[]> {
  const db = await getEngine()
  const rows = await db.all<Row>(
    'SELECT data FROM consents WHERE user_id = ? ORDER BY accepted_at DESC',
    [userId],
  )
  return rows.map(parse).filter((r): r is ConsentRecord => r !== null)
}

export async function latestConsent(userId: string): Promise<ConsentRecord | null> {
  return (await listConsents(userId))[0] ?? null
}

/**
 * Whether a member should be asked to accept updated terms.
 *
 * Compares editorial VERSION only, not the content hash: a founder nudging the
 * notice period changes the hash, and interrupting every member with a consent
 * wall over that would be noise. A material change is a version bump — that's
 * what the version is for.
 */
export async function needsReconsent(userId: string, termsVersion = TERMS_VERSION): Promise<boolean> {
  const consents = await listConsents(userId)
  if (consents.length === 0) return true
  return !consents.some((c) => c.documents.some((d) => d.id === 'terms' && d.version === termsVersion))
}

/**
 * Whether this member's consent covers the cancel settlement — the balance owed
 * on goods already sent when they cancel early.
 *
 * The gate for ever charging one. A member who accepted the earlier terms was
 * told they could cancel "with no fee"; charging them a balance they were never
 * shown would be a term they never agreed to, whatever the maths says. They
 * cancel free until they accept the version that discloses it.
 *
 * Compares versions as ordered strings — the versions are ISO dates, so "later
 * or equal" is the correct reading and a member who has since accepted a NEWER
 * set of terms is covered too.
 */
export async function consentCoversSettlement(
  userId: string,
  since = SETTLEMENT_TERMS_VERSION,
): Promise<boolean> {
  const consents = await listConsents(userId)
  return consents.some((c) => c.documents.some((d) => d.id === 'terms' && d.version >= since))
}

/**
 * Request metadata for the evidence record, from a route handler's request.
 * Typed against the headers it actually reads rather than the full `Request`,
 * so it's callable (and testable) anywhere without a fetch implementation.
 */
export function requestMetadata(req: {
  headers: { get(name: string): string | null }
}): { ip: string | null; userAgent: string | null } {
  const forwarded = req.headers.get('x-forwarded-for')
  return {
    // The left-most entry is the client; the rest are proxies.
    ip: forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null,
    userAgent: req.headers.get('user-agent'),
  }
}
