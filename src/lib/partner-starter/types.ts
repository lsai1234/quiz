/**
 * Partner starter stacks — the shapes.
 *
 * ── What this is ────────────────────────────────────────────────────────────
 * A micro-influencer partner gets their own stack free. They cannot review a
 * product they have not taken, and asking somebody to pay for the thing they
 * are about to make three pieces of content about is how a partner programme
 * starts on the wrong foot.
 *
 * ── Why it is not a founder code ────────────────────────────────────────────
 * A founder code (`lib/founder-codes`) is anonymous, lives 24 hours, and takes
 * 100% off whatever happens to be in the basket. Every one of those is wrong
 * here:
 *
 *   • It belongs to a NAMED partner, and the order it raises is the record of
 *     what that partner was given.
 *   • It is spent against a promise. The code does nothing at all until the
 *     partner has signed the agreement saying what they will post — that is
 *     the consideration, and a free box handed over before it is made is a gift
 *     with no counterparty obligation attached.
 *   • It is capped to a stack. "Everything free" against an open basket is an
 *     instrument we are willing to point at ourselves for a day; pointed at
 *     forty partners it is an open bar.
 *   • Twenty-four hours is the wrong life for something that has to survive an
 *     invite email, a quiz and a decision.
 *
 * ── Why it is not a partner code either ─────────────────────────────────────
 * A `PartnerCode` is the partner's COMMERCIAL instrument: it belongs to their
 * followers, takes 25% off, earns the partner commission and is priced against
 * a stack's lifetime value. This one belongs to the partner personally, takes
 * 100% off exactly once, and earns them nothing — their own purchases never
 * accrue commission, which is a term of the programme, not an oversight.
 */
import type { StackLevel } from '@/lib/types'

/**
 * Which depth of stack a starter buys.
 *
 * Essentials or Balanced — the two the programme offers, and deliberately not
 * Complete. `StackLevel`'s own name for Balanced is `performance`; the label
 * everybody actually uses is in `TIER_META`.
 */
export type StarterTier = Extract<StackLevel, 'essentials' | 'performance'>

/** The state a starter is in — what a screen has to say about it. */
export type StarterState =
  /** Issued, agreement not signed. It buys nothing in this state. */
  | 'unsigned'
  /** Signed and spendable. */
  | 'ready'
  /** Spent on an order. */
  | 'used'
  | 'expired'
  | 'revoked'

/** One issued starter. Single use, by the same claim-token lock founder codes use. */
export interface PartnerStarter {
  /** The code itself, normalised — e.g. `PS-7K4M2XQP`. */
  code: string
  partnerId: string
  tier: StarterTier
  /**
   * The most the goods may list at (£, inc VAT).
   *
   * Stored on the row rather than read from the config at redemption, for the
   * same reason a commission stores its rate: the ceiling is part of what the
   * partner was offered, and moving a pricing band next month must not quietly
   * shrink a starter somebody is holding.
   */
  goodsCap: number
  /** Why it was issued. Founder-facing; never shown at checkout. */
  note: string | null
  /** Email of the founder who issued it. Attribution, not authorisation. */
  createdBy: string | null
  createdAt: string
  /** ISO. Past this it is dead however it is presented. */
  expiresAt: string
  /**
   * The signed agreement that unlocked it, or null.
   *
   * This is the gate. `null` means the partner has been offered a stack and has
   * not yet promised anything for it, and a code in that state is refused at
   * checkout with a message that says where to go and sign.
   */
  agreementId: string | null
  /** The single-use lock — see `claimStarter`. */
  claimToken: string | null
  claimedAt: string | null
  usedAt: string | null
  orderId: string | null
  revokedAt: string | null
}

/** One thing a partner has promised to post. */
export interface Deliverable {
  id: string
  /** What they are agreeing to do, in the words they will read. */
  text: string
}

/**
 * A signed content agreement. Append-only — nothing here is ever updated.
 *
 * The evidence rules are `lib/legal/consent`'s, for the same reason: the
 * browser does not get to tell us what it agreed to. The server renders the
 * text, hashes what it rendered, and stores that hash — so "they signed
 * something" can always be resolved to "they signed exactly this".
 */
export interface PartnerAgreement {
  id: string
  partnerId: string
  /** The starter this agreement was signed for. */
  code: string
  version: string
  /** SHA-256 of the exact text served. */
  docHash: string
  /** Typed by the partner. A name, not a signature image — see `agreement.ts`. */
  signedName: string
  /** What they committed to, as served. */
  deliverables: Deliverable[]
  /** Their handle, so the promise is attached to an account we can go and look at. */
  handle: string | null
  signedAt: string
  ip: string | null
  userAgent: string | null
}
