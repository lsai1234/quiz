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
 */

export type TemplateId =
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

export interface NotificationProvider {
  readonly name: 'mock' | 'resend'
  send(to: string, email: RenderedEmail): Promise<SendResult>
}
