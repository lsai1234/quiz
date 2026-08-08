/**
 * Partner programme — the service layer.
 *
 * What the hub and (later) the partner dashboard call. Composes the repository
 * with the pure rules in `codes.ts` and `terms.ts`, so the interesting decisions
 * stay testable without a database.
 *
 * Server-only.
 */
import { defaultCodeTerms, suggestCode, normaliseCode } from './codes'
import { canTakeEffect, defaultTerms, sortedHistory, termsInForce } from './terms'
import * as repo from './repo'
import type { CodeTerms, Partner, PartnerRecord, PartnerStatus, PartnerTerms } from './types'

export * from './types'
export { normaliseCode, suggestCode, checkCode, defaultCodeTerms, isExpired } from './codes'
export { describeTerms, describePayout, termsInForce, sortedHistory } from './terms'

/**
 * Create a partner, their first code and their opening terms in one go.
 *
 * All three together on purpose: a partner with no code cannot bring in an
 * order, and a partner with no terms row has no answer to "what am I on" — which
 * is the question the whole programme has to be able to answer at any moment.
 */
export async function createPartner(input: {
  email: string
  name: string
  /** 0–1. Defaults to the programme-wide follower discount. */
  discountPct?: number
  /** Override the generated code. */
  code?: string
  createdBy?: string
}): Promise<PartnerRecord> {
  const existing = await repo.getPartnerByEmail(input.email)
  if (existing) throw new Error(`A partner already exists for ${input.email}.`)

  const { getPricingConfig } = await import('@/lib/stack-blueprint/pricing')
  const discountPct = input.discountPct ?? getPricingConfig().partners.introFloorPct

  const partner = await repo.createPartner({ email: input.email, name: input.name })

  const taken = (await repo.listAllCodes()).map((c) => c.code)
  const code = input.code ? normaliseCode(input.code) : suggestCode(input.name, discountPct, taken)
  if (taken.includes(code)) throw new Error(`The code ${code} is already in use.`)

  const created = await repo.createCode({
    code,
    partnerId: partner.id,
    discountPct,
    terms: defaultCodeTerms(),
  })

  const opening = await repo.addTerms({ ...defaultTerms(), partnerId: partner.id, createdBy: input.createdBy ?? null })

  return { partner, codes: [created], terms: opening, termsHistory: [opening] }
}

/** Everything about one partner: the account, their codes, their deal and its history. */
export async function getPartnerRecord(id: string, at: Date = new Date()): Promise<PartnerRecord | null> {
  const partner = await repo.getPartner(id)
  if (!partner) return null

  const [codes, history] = await Promise.all([repo.listCodes(id), repo.listTerms(id)])
  const terms = termsInForce(history, at)
  if (!terms) {
    // Every partner is created with an opening terms row, so this means the row
    // is future-dated — treat the earliest as in force rather than returning a
    // partner with no answer to "what am I on".
    const earliest = sortedHistory(history).at(-1)
    if (!earliest) return null
    return { partner, codes, terms: earliest, termsHistory: sortedHistory(history) }
  }
  return { partner, codes, terms, termsHistory: sortedHistory(history) }
}

export async function listPartnerRecords(): Promise<PartnerRecord[]> {
  const partners = await repo.listPartners()
  const records = await Promise.all(partners.map((p) => getPartnerRecord(p.id)))
  return records.filter((r): r is PartnerRecord => r !== null)
}

/**
 * Supersede a partner's terms.
 *
 * `oldestUnsettled` is the earliest commission that has not yet been paid — new
 * terms cannot start before it, or the ledger's stored rate and the partner's
 * stated history would disagree. Phase 3 passes the real value; until the ledger
 * exists there is nothing to protect, so null is honest rather than lax.
 */
export async function changeTerms(
  partnerId: string,
  next: {
    firstOrderPct: number
    renewalPct: number
    renewalMonths: number
    payout: PartnerTerms['payout']
    effectiveFrom: string
    note: string
    createdBy?: string
  },
  oldestUnsettled: string | null = null,
): Promise<PartnerTerms> {
  if (!next.note?.trim()) {
    // Not optional: the note is the thing the partner reads to understand why
    // their deal changed.
    throw new Error('Give a reason for the change — the partner sees it.')
  }
  const check = canTakeEffect(next.effectiveFrom, oldestUnsettled)
  if (!check.ok) throw new Error(check.reason)

  // Refuse a row that would be dead on arrival. Rows are ordered by
  // `effectiveFrom`, so one dated before the newest existing row is superseded
  // the instant it is written: the history grows, the partner's deal does not
  // change, and nobody is told. Same principle as a code that quietly does
  // nothing — the silent no-op is the worst outcome, so it is an error instead.
  const newest = sortedHistory(await repo.listTerms(partnerId))[0]
  if (newest && new Date(next.effectiveFrom) < new Date(newest.effectiveFrom)) {
    throw new Error(
      `These terms start before the ones already recorded (from ${newest.effectiveFrom.slice(0, 16).replace('T', ' ')}), ` +
        'so they would be superseded the moment they were saved and nothing would change. Start them later.',
    )
  }

  return repo.addTerms({
    partnerId,
    firstOrderPct: next.firstOrderPct,
    renewalPct: next.renewalPct,
    renewalMonths: next.renewalMonths,
    payout: next.payout,
    effectiveFrom: next.effectiveFrom,
    note: next.note.trim(),
    createdBy: next.createdBy ?? null,
  })
}

/**
 * Suspend or reinstate. A suspended partner's codes stop working immediately.
 *
 * Suspension also ends every session they hold. Leaving them signed in would
 * show a live-looking dashboard for an account that no longer earns, and the
 * request-side check alone would depend on every screen remembering to make it.
 */
export async function setPartnerStatus(id: string, status: PartnerStatus): Promise<void> {
  await repo.updatePartner(id, { status })
  if (status === 'suspended') await repo.deleteSessionsFor(id)
}

export async function updateCodeTerms(
  code: string,
  patch: { discountPct?: number; terms?: CodeTerms; status?: 'active' | 'paused' | 'expired' },
): Promise<void> {
  await repo.updateCode(normaliseCode(code), patch)
}

/** Resolve a typed code to its partner, for redemption. */
export async function resolveCode(input: string): Promise<{ code: NonNullable<Awaited<ReturnType<typeof repo.getCode>>>; partner: Partner } | null> {
  const code = await repo.getCode(normaliseCode(input))
  if (!code) return null
  const partner = await repo.getPartner(code.partnerId)
  return partner ? { code, partner } : null
}
