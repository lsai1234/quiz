/**
 * Orders that were never paid for.
 *
 * Every Stripe checkout raises its order BEFORE the customer reaches the payment
 * page, at `pending_payment`, so that the webhook has something to mark paid.
 * When they leave without paying, Stripe expires the session a day later (or the
 * daily sweep closes it if that webhook never came) and the order is moved to
 * `failed` with a `payment_not_completed` event.
 *
 * `failed` also means something else entirely: a PAID order that PowerBody
 * refused. The two were read as one, so an abandoned basket turned up in the
 * review queue as "waiting on your review", offered "Retry send to PowerBody"
 * and a refund, and counted on the dashboard as an order that failed to reach
 * the supplier. None of that is true of an order nobody paid for, and the send
 * button was the dangerous part: add an address, press it, and stock ships for
 * free.
 *
 * Read from the event rather than a status of its own so that every order
 * already closed this way is recognised without a data migration. Pure, with no
 * server imports, so the hub's client components can use the same test the
 * domain does.
 */
/**
 * Looser than `Pick<Order, …>` on purpose: the hub's client components hold
 * their own copy of an order with `status: string`, and must be able to ask.
 */
interface PaymentFacts {
  status: string
  events?: { type: string }[] | null
}

/** The event `failOrder` writes when a checkout closes without a payment. */
export const PAYMENT_NOT_COMPLETED = 'payment_not_completed'

/** True for a checkout somebody started and never paid for. */
export function neverPaid(order: PaymentFacts): boolean {
  if (order.status !== 'failed') return false
  // The latest word on payment, not any word: a payment Stripe reports after
  // the sweep closed the order adds a `paid` after this event, and that order —
  // paid, then refused by PowerBody — is a real failure.
  const last = [...(order.events ?? [])]
    .reverse()
    .find((e) => e.type === 'paid' || e.type === PAYMENT_NOT_COMPLETED)
  return last?.type === PAYMENT_NOT_COMPLETED
}

/**
 * The status to show for an order. `not_paid` is a label, not a stored status —
 * stored, these stay `failed`, which every query and filter already handles.
 */
export function displayStatus(order: PaymentFacts): string {
  return neverPaid(order) ? 'not_paid' : order.status
}
