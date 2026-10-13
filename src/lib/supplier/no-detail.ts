/**
 * "PowerBody answered, and there was no product in the answer" — as a fact the
 * code can test, rather than a sentence it has to read.
 *
 * ── Why this is its own error ───────────────────────────────────────────────
 * An id with nothing behind it is the most ordinary answer the detail call
 * gives: ids are sparse, a SKU's P can fall off on the way out of a
 * spreadsheet, and PowerBody delist products. It used to be thrown as a plain
 * Error whose message ended with OUR guess at a cause — "getProductInfo may not
 * be enabled on this API account (new accounts start in their DEMO sandbox)",
 * or, for one of their envelopes, "it is usually rate limiting". The resolver
 * then classified PowerBody's refusal by running patterns over that message, so
 * the words we had written to explain things were read back as the diagnosis:
 * a founder who pasted "44338" for P44338 was told the account was still the
 * DEMO sandbox, the whole batch stopped, and a perfectly healthy account was
 * sent to PowerBody's account manager.
 *
 * So the case travels as a flag, with PowerBody's own words (their
 * `api_response`, when they gave one) in a field of their own. Whatever reads
 * it classifies on THEIR words, and on the flag; never on ours.
 *
 * Duck-typed rather than `instanceof`, like `sendEvidenceOf`: the live adapter
 * is imported dynamically, and a check that depends on two chunks agreeing
 * about class identity is one that fails quietly the day they don't.
 */

export class NoProductDetailError extends Error {
  readonly noProductDetail = true as const

  constructor(
    message: string,
    /** The id that was asked about. */
    readonly productId: string,
    /** PowerBody's own words, when their reply carried any. Null when it carried nothing at all. */
    readonly said: string | null,
  ) {
    super(message)
    this.name = 'NoProductDetailError'
  }
}

/** The id and PowerBody's words, when this error is "no product in the answer". */
export function noProductDetail(err: unknown): { productId: string; said: string | null } | null {
  if (!err || typeof err !== 'object' || (err as { noProductDetail?: unknown }).noProductDetail !== true) return null
  const { productId, said } = err as { productId?: unknown; said?: unknown }
  return {
    productId: typeof productId === 'string' ? productId : String(productId ?? ''),
    said: typeof said === 'string' && said.trim() !== '' ? said.trim() : null,
  }
}

/**
 * The detail call answered nothing even for products PowerBody's OWN list
 * names — several of them, so it is not one delisted product.
 *
 * This, and only this, is the evidence for "this API account cannot read
 * product detail" (their DEMO sandbox, or the method not switched on). One id
 * answering nothing is evidence about that id.
 */
export class DetailCallSilentError extends Error {
  readonly detailCallSilent = true as const

  constructor(
    message: string,
    /** PowerBody's own words from the failed checks, when they gave any. */
    readonly said: string | null,
  ) {
    super(message)
    this.name = 'DetailCallSilentError'
  }
}

export function detailCallSilent(err: unknown): { said: string | null } | null {
  if (!err || typeof err !== 'object' || (err as { detailCallSilent?: unknown }).detailCallSilent !== true) return null
  const { said } = err as { said?: unknown }
  return { said: typeof said === 'string' && said.trim() !== '' ? said.trim() : null }
}
