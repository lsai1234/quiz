/**
 * What happened when an order was sent to the supplier — carried on the error.
 *
 * A failed send used to leave one line behind: our own sentence, ending in
 * whatever single word PowerBody put in `api_response`. What we sent and the
 * rest of what they answered were gone, so "why won't this order go?" could
 * only be answered by guessing. The evidence rides on the error instead, and
 * the orders domain keeps it on the order (`Order.lastSupplierAttempt`) where
 * the order page can show it.
 */

/**
 *   rejected    — they read it and said no: an `api_response` that is not success.
 *   unreadable  — they answered, but not in a shape we understand, and the order
 *                 is not on their account when we look. A fault at OUR end.
 *   fault       — their server refused the call itself (a SOAP fault).
 *   unreachable — no decision at all: a timeout, a refused login, an HTTP error.
 */
export type SupplierSendOutcome = 'rejected' | 'unreadable' | 'fault' | 'unreachable'

export interface SupplierSendEvidence {
  outcome: SupplierSendOutcome
  /** Their `api_response` code, or the fault/HTTP code. */
  code: string | null
  /** Their own explanation, when they gave one. */
  reason: string | null
  /** The whole reply, compact and bounded. Null when nothing came back. */
  reply: string | null
  /** Exactly what we sent. */
  request: unknown
}

export class SupplierSendError extends Error {
  readonly evidence: SupplierSendEvidence

  constructor(message: string, evidence: SupplierSendEvidence) {
    super(message)
    this.name = 'SupplierSendError'
    this.evidence = evidence
  }
}

/**
 * The evidence on a failed send, if it carries any.
 *
 * Duck-typed rather than `instanceof`: the live adapter is imported dynamically,
 * and a check that depends on two chunks agreeing about class identity is one
 * that fails quietly the day they don't.
 */
export function sendEvidenceOf(err: unknown): SupplierSendEvidence | null {
  if (!err || typeof err !== 'object' || !('evidence' in err)) return null
  const evidence = (err as { evidence: unknown }).evidence
  return evidence && typeof evidence === 'object' && 'outcome' in evidence
    ? (evidence as SupplierSendEvidence)
    : null
}
