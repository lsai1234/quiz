/**
 * Signing a partner agreement.
 *
 * ── The rule this module exists to enforce ──────────────────────────────────
 * **The browser never tells us what it agreed to.** It sends a name, a handle
 * and the version it says it displayed. The server renders the document itself,
 * from `agreement.ts`, hashes exactly what it rendered, and stores that. A
 * tampered or stale payload cannot manufacture consent to something the partner
 * never saw — the same rule `lib/legal/consent` follows, and the reason both
 * modules hash server-side rather than accepting a hash.
 *
 * The version IS checked, and a mismatch is refused rather than silently
 * upgraded: if the wording changed while they had the page open, what is on
 * their screen is not what they would be signing, and the honest answer is to
 * show them the new one.
 *
 * Server-only.
 */
import { createHash } from 'crypto'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { listCodes } from '@/lib/partners/repo'
import type { Partner, PartnerCode } from '@/lib/partners/types'
import {
  PARTNER_AGREEMENT_VERSION,
  PARTNER_DELIVERABLES,
  partnerAgreementText,
  type AgreementContext,
} from './agreement'
import * as repo from './repo'
import { checkStarter } from './rules'
import type { PartnerAgreement, PartnerStarter } from './types'

/** SHA-256 of the exact text served — what ties a signature to a wording. */
export function hashAgreement(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** No code on the account yet — the normal path cannot produce this. */
export const NO_CODE_YET = '(to be issued)'

/**
 * The document for this partner and this starter, as they will read it.
 *
 * The partner's own code goes in the text because the agreement is about what
 * they will post, and what they post carries that code. A partner with no code
 * yet reads a placeholder rather than an empty gap — the commercial terms are
 * the same either way, and in practice `createPartner` mints the code, the
 * opening terms and the account in one call, so it is live before the link is
 * ever sent.
 */
export async function agreementFor(partner: Partner, starter: PartnerStarter): Promise<{
  version: string
  text: string
  context: AgreementContext
}> {
  const codes: PartnerCode[] = await listCodes(partner.id).catch(() => [])
  const context: AgreementContext = {
    partnerName: partner.name,
    partnerCode: codes.find((c) => c.status === 'active')?.code ?? codes[0]?.code ?? NO_CODE_YET,
    goodsCap: formatGBP(starter.goodsCap),
    expiresAt: starter.expiresAt,
  }
  return { version: PARTNER_AGREEMENT_VERSION, text: partnerAgreementText(context), context }
}

export type SignResult =
  | { ok: true; agreement: PartnerAgreement }
  | { ok: false; reason: string; staleVersion?: boolean }

/**
 * A name is a signature here, and this is what makes one valid.
 *
 * Two characters and a space is not somebody's name, and a blank box that
 * submits is an agreement nobody signed. Deliberately not stricter than that:
 * name validation that rejects real names is a well-known way to lock people
 * out of their own paperwork, so this checks that something was typed, not that
 * it looks English.
 */
export function signatureProblem(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length < 3) return 'Type your full name to sign.'
  if (trimmed.length > 120) return 'That name is too long.'
  return null
}

/**
 * Sign, and switch the starter on.
 *
 * Refuses a starter that is not in a state to be signed for — a used, expired
 * or revoked one — because a signature against a dead code is a promise made
 * for nothing, and the partner would be left holding an obligation with no
 * stack behind it.
 */
export async function signAgreement(input: {
  partner: Partner
  starter: PartnerStarter
  signedName: string
  handle?: string | null
  version: string
  ip?: string | null
  userAgent?: string | null
  now?: Date
}): Promise<SignResult> {
  if (input.starter.partnerId !== input.partner.id) {
    return { ok: false, reason: 'That code belongs to a different partner.' }
  }
  if (input.starter.agreementId) {
    return { ok: false, reason: 'You have already signed for this one.' }
  }

  const state = checkStarter(input.starter, input.now)
  // The unsigned refusal is the one state we are here to LEAVE, so it is not a
  // reason to stop. Every other refusal is.
  if (!state.ok && !input.starter.agreementId && !state.reason.startsWith('Sign your partner agreement')) {
    return { ok: false, reason: state.reason }
  }

  const problem = signatureProblem(input.signedName)
  if (problem) return { ok: false, reason: problem }

  if (input.version !== PARTNER_AGREEMENT_VERSION) {
    return {
      ok: false,
      staleVersion: true,
      reason: 'The agreement was updated while this page was open. Have a read of the new one and sign that.',
    }
  }

  const { text, version } = await agreementFor(input.partner, input.starter)
  const agreement = await repo.signStarter({
    starter: input.starter,
    version,
    docHash: hashAgreement(text),
    signedName: input.signedName,
    handle: input.handle ?? null,
    // Served, not submitted. What they agreed to is what the document said.
    deliverables: PARTNER_DELIVERABLES,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  })
  return { ok: true, agreement }
}
