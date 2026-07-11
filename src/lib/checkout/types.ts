import type { MemberSubscription } from '@/lib/recharge/types'
import type { SubscriptionCheckoutLine } from '@/lib/stack-blueprint/checkout'
import type { QuizAnswers, StackLevel } from '@/lib/types'

/** What a member subscribes with — persisted to their account at checkout so
 *  the hub shows their real bundle and their quiz answers when they return. */
export interface CheckoutPayload {
  /** The member's bundle as the hub manages it (built from their real stack). */
  subscription: MemberSubscription
  /** Their quiz answers + stack context, for "see your answers" in the hub. */
  quiz?: { answers: QuizAnswers; level?: StackLevel } | null
  /** Cart lines for the live Shopify checkout (empty/omitted in mock mode). */
  lines?: SubscriptionCheckoutLine[]
}
