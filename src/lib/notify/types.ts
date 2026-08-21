/**
 * Member notifications — the contract.
 *
 * Every email is queued in the outbox before it is sent, so a send that fails is
 * visible and retryable rather than lost, and mock mode is a genuine working
 * flow (queue, render, mark sent) rather than a stub.
 *
 * The design rule these types encode: **no email in this domain asks the member
 * to do anything for their subscription to keep working.** A product change has
 * already been decided and applied by the time we write; the email says what
 * happened and invites them to adjust it. That invitation is only real if the
 * link lands somewhere useful, which is why every context carries a deep link
 * into the hub flow that can act on it rather than the hub's front door.
 *
 * The confirmation emails added alongside them follow the same rule from the
 * other end: they confirm a purchase that has already been paid for, and their
 * only ask is "here is where you manage it".
 */
import type { MailStream } from './streams'

export type { MailStream }

export type TemplateId =
  /** A one-off order is paid: here is your receipt. */
  | 'order-confirmation'
  /** A plan has started: here is your receipt, and here is your hub. */
  | 'subscription-confirmation'
  /** We swapped a product for the closest equivalent. */
  | 'product-substituted'
  /** We took a product off the plan and lowered the monthly. */
  | 'product-removed'
  /** A price rise is coming, with notice and a free exit. */
  | 'price-change-notice'
  /** The terms changed materially. */
  | 'terms-updated'
  /** A card was declined and Stripe is retrying. */
  | 'payment-failed'
  /** Their plan has ended: what was sent, what was paid, what was settled. */
  | 'exit-receipt'
  /** The settlement invoice could not be taken from their card. */
  | 'exit-charge-failed'
  /** They chose to leave on their next free date, and we are confirming when. */
  | 'exit-scheduled'
  /** They cancelled inside the 14 days and are sending everything back. */
  | 'exit-return-requested'
  /**
   * A one-time link to set a new password.
   *
   * The exception to this file's rule that no email asks the member to act —
   * this one is the act, and they asked for it thirty seconds ago. It is also
   * the only email whose stored copy is not what was sent: the link is a live
   * credential and is not kept. See `./account`.
   */
  | 'password-reset'
  /** Their password was changed — the notice that catches it if it wasn't them. */
  | 'password-changed'
  /**
   * The stack somebody asked us to email them from the quiz.
   *
   * The one template here sent to a person who has bought nothing — `userId` is
   * null and there is no order behind it. It is transactional in the sense that
   * matters: they typed their address and pressed a button that said what would
   * happen, and this is that thing happening. The marketing tick beside that
   * button governs the promotional strip only, never whether this arrives.
   */
  | 'stack-email'
  /**
   * A campaign: the email that IS the marketing, rather than one carrying a
   * strip of it. Sent only to an address `mayMarket()` currently says yes to,
   * re-checked at the moment of sending.
   */
  | 'marketing-broadcast'
  /** Confirming a marketing opt-in, and offering the way straight back out. */
  | 'marketing-welcome'

export type NotificationStatus = 'queued' | 'sent' | 'failed'

/** A rendered email. Plain text is not optional — some clients only show it. */
export interface RenderedEmail {
  subject: string
  text: string
  html: string
}

export interface Notification {
  id: string
  userId: string | null
  email: string
  template: TemplateId
  /**
   * Which mail stream this left on — orders, subscriptions or billing. Stored
   * rather than re-derived from the template so the log keeps telling the truth
   * about an email sent last March if the mapping changes tomorrow.
   */
  stream?: MailStream
  /**
   * The From header used, resolved at queue time and stored for the same reason.
   * "Which address did this actually go out from?" is the first question asked
   * when one stream's deliverability goes wrong.
   */
  from?: string
  /** Where a reply goes — the monitored inbox behind the noreply sender. */
  replyTo?: string | null
  /**
   * `<changeEventId>:<template>`. UNIQUE in the database, which is what makes a
   * re-run of the daily job unable to email anyone twice about one change.
   */
  dedupeKey: string
  status: NotificationStatus
  attempts: number
  rendered: RenderedEmail
  /** Provider message id, once sent. Null when a person sent it themselves. */
  providerId?: string | null
  /**
   * Ticked off by a founder who sent it from their own mail client, rather than
   * delivered by a provider. Worth distinguishing: "we know this was delivered"
   * and "someone said they sent it" are different claims.
   */
  sentManually?: boolean
  /** Last failure, kept so the hub can show why rather than just "failed". */
  error?: string | null
  /** The change this concerns, for cross-referencing the audit trail. */
  changeEventId?: string | null
  createdAt: string
  updatedAt: string
  sentAt?: string | null
}

export interface SendResult {
  providerId?: string
}

/** What a caller hands the outbox to have an email queued. */
export interface QueueInput {
  userId: string | null
  email: string
  template: TemplateId
  rendered: RenderedEmail
  /** The change this concerns. Also the dedupe key's prefix. */
  changeEventId?: string | null
  /** Override the dedupe key for notifications not tied to a change event. */
  dedupeKey?: string
}

/** Delivery headers, resolved from the notification's stream. */
export interface SendEnvelope {
  from?: string
  replyTo?: string | null
}

export interface NotificationProvider {
  readonly name: 'mock' | 'resend' | 'gmail'
  send(to: string, email: RenderedEmail, envelope?: SendEnvelope): Promise<SendResult>
}
