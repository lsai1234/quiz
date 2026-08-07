/**
 * Partner (influencer) programme — the shapes.
 *
 * A partner is a commercial counterparty, not a customer and not a founder.
 * They hold their own account, earn commission on orders their code brings in,
 * and can read their own numbers and their own terms at `/partner`.
 *
 * The rates live in `PRICING_CONFIG.partners` as a DEFAULT. What any individual
 * partner is actually on is a `PartnerTerms` row, because the moment one of them
 * negotiates, a single global rate stops being able to describe the programme.
 */

export type PartnerStatus =
  /** Created, not yet signed in — no password set. */
  | 'invited'
  | 'active'
  /** Suspended: their code stops working and no new commission accrues. */
  | 'suspended'

export interface Partner {
  id: string
  email: string
  name: string
  status: PartnerStatus
  /** Free-form: socials, payout details, internal notes. */
  data: PartnerData
  createdAt: string
  updatedAt: string
}

export interface PartnerData {
  /** Where they post — for a founder's context, not used in logic. */
  handles?: string[]
  /** Bank/PayPal reference for payouts. Never shown outside the hub. */
  payTo?: string
  /** Internal notes. NOT shown to the partner. */
  notes?: string
}

/** What a partner's code takes off, and the fences around it. */
export interface CodeTerms {
  /**
   * Redeemable only on someone's first order.
   *
   * Defaults ON. A code without this is a permanent site-wide discount the
   * moment it reaches a deal site, and retrofitting it later means changing
   * terms a partner has already been told.
   */
  firstOrderOnly: boolean
  /** Hard cap on redemptions. Null = uncapped. */
  maxUses: number | null
  /** How many times it has been used. */
  uses: number
  /** ISO date the code starts working. Null = immediately. */
  startsAt: string | null
  /** ISO date it stops. Null = never. */
  endsAt: string | null
  /** Minimum order subtotal in £. Null = none. */
  minSpend: number | null
}

export type CodeStatus = 'active' | 'paused' | 'expired'

export interface PartnerCode {
  code: string
  partnerId: string
  /** 0–1. What a follower gets off. */
  discountPct: number
  terms: CodeTerms
  status: CodeStatus
  createdAt: string
}

/** How a partner gets paid, once they are owed something. */
export interface PayoutTerms {
  cadence: 'monthly' | 'quarterly'
  /** Below this the balance carries forward (£). */
  minimum: number
  selfBilled: boolean
  /** A VAT-registered partner invoices commission plus VAT. */
  chargesVat: boolean
}

/**
 * The deal a partner is on, from `effectiveFrom` until superseded.
 *
 * Append-only. Changing a deal writes a new row rather than editing one: once a
 * partner can read their terms, those terms are a statement made to a
 * counterparty, and an update destroys the evidence of what was said before.
 */
export interface PartnerTerms {
  id: string
  partnerId: string
  /** Commission on a member's first order (0–1). */
  firstOrderPct: number
  /** Commission on each subsequent renewal (0–1). */
  renewalPct: number
  /** Months of renewals earned on, from signup. */
  renewalMonths: number
  payout: PayoutTerms
  effectiveFrom: string
  /** Why it changed. Shown to the partner — this is the point of the row. */
  note: string | null
  /** Founder who made the change. */
  createdBy: string | null
  createdAt: string
}

/** A partner with everything a founder or the partner themselves needs to see. */
export interface PartnerRecord {
  partner: Partner
  codes: PartnerCode[]
  /** The terms in force now. */
  terms: PartnerTerms
  /** Every version, newest first — the dated history. */
  termsHistory: PartnerTerms[]
}
