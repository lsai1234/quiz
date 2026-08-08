import type { MemberSubscription } from '@/lib/recharge/types'
import type { ConsentSubmission } from '@/lib/legal/consent'
import type { QuizAnswers, StackLevel } from '@/lib/types'

/** What a member subscribes with — persisted to their account at checkout so
 *  the hub shows their real bundle and their quiz answers when they return. */
export interface CheckoutPayload {
  /** The member's bundle as the hub manages it (built from their real stack). */
  subscription: MemberSubscription
  /** Their quiz answers + stack context, for "see your answers" in the hub. */
  quiz?: { answers: QuizAnswers; level?: StackLevel } | null
  // NOTE: this used to carry `lines: SubscriptionCheckoutLine[]` for the old
  // storefront cart. Nothing ever read it — `finalizeCheckout` builds the Stripe
  // session from the subscription's own flat monthly — so it has been removed
  // rather than left as a field the client populates and the server ignores.
  /**
   * The member ticking the terms + health box at the gate. Required — the
   * server refuses to finalize without it, and records its own view of which
   * documents that means rather than trusting this.
   */
  consent?: ConsentSubmission
  /**
   * A partner's code, as typed. Re-validated server-side in `finalizeCheckout`
   * — what the browser sends is a string, never a discount.
   */
  partnerCode?: string | null
}
