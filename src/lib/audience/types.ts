/**
 * The marketing audience — everyone who has given us an email address.
 *
 * Shared types only, so a client component can describe a capture without
 * pulling the database in behind it.
 */

/** Where an address came from. Kept on the lead AND on every consent row. */
export type LeadSource =
  /** The "keep your stack" card on the quiz reveal. */
  | 'quiz-reveal'
  /** The field on the build screen, while the stack is being worked out. */
  | 'quiz-build'
  /** Signing up or signing in at the checkout account gate. */
  | 'checkout'
  /** A founder added it by hand. */
  | 'manual'

/**
 * Why we are allowed to market to this address.
 *
 * Not interchangeable, which is why it is stored rather than inferred: consent
 * is a tick a prospect gave us (UK GDPR Art. 4(11)); soft opt-in is PECR reg.
 * 22(3), which permits similar products to someone who bought or negotiated to
 * buy. A list that has forgotten which is which can only be treated as the
 * stricter one, so forgetting costs the whole list.
 */
export type ConsentBasis = 'consent' | 'soft-opt-in'

export type ConsentAction = 'opt-in' | 'opt-out'

export interface EmailLead {
  email: string
  firstName: string | null
  source: LeadSource
  /** Quiz track, for segmenting a campaign. */
  track: string | null
  primaryGoal: string | null
  /** Set once the address belongs to an account, so one preference governs both. */
  userId: string | null
  firstSeenAt: string
  lastSeenAt: string
}

/** One append-only record of somebody's preference changing. */
export interface MarketingConsentRecord {
  id: string
  email: string
  action: ConsentAction
  basis: ConsentBasis
  /** The version and hash of the sentence shown. Null for an opt-out. */
  statementVersion: string | null
  statementHash: string | null
  source: string
  ip: string | null
  userAgent: string | null
  createdAt: string
}

/** A lead plus the answer to "may we email this person?". */
export interface AudienceMember extends EmailLead {
  marketable: boolean
  basis: ConsentBasis | null
  optedInAt: string | null
  suppressedAt: string | null
}
