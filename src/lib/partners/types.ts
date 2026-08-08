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

/**
 * One earned commission, on one order.
 *
 * `rate` and `netBasis` are STORED, not looked up. Change a partner's rate next
 * quarter and last quarter's ledger must not silently restate — the same reason
 * `supplierSimulated` is recorded per order rather than read from the setting.
 */
export interface PartnerCommission {
  id: string
  partnerId: string
  orderId: string
  kind: 'first' | 'renewal'
  /** Net revenue the rate applied to (£, ex VAT, ex delivery). */
  netBasis: number
  /** The rate that applied ON THE DAY (0–1). */
  rate: number
  /** What the partner earns (£), after the contribution guard. */
  amount: number
  state: 'accrued' | 'confirmed' | 'reversed' | 'paid'
  /** When it stops being reversible and becomes payable (ISO). */
  confirmAfter: string
  /** The payout run that settled it, once paid. */
  payoutId: string | null
  createdAt: string
}

/** A settled batch of commission for one partner and one period. */
export interface PartnerPayout {
  id: string
  partnerId: string
  /** `YYYY-MM` — the period being settled. */
  period: string
  amount: number
  state: 'due' | 'paid'
  /** Bank reference, once it has actually been sent. */
  reference: string | null
  createdAt: string
}

/** What a partner is owed, split by how settled it is. */
export interface PartnerBalance {
  /** Earned but still inside the return window (£). */
  accrued: number
  /** Past the window, payable in the next run (£). */
  confirmed: number
  /** Already sent (£). */
  paid: number
  /** Reversed by a refund (£) — shown, never hidden. */
  reversed: number
  /** `confirmed`, which is the only figure that is actually owed today. */
  payableNow: number
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
