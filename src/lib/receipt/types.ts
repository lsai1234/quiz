/**
 * The shape of a printed receipt.
 *
 * Deliberately a *print* model, not a data model: every value is already a
 * string, formatted and rounded, because a thermal printer has no opinions
 * about currency and neither should the component that draws one. The builders
 * in `build.ts` are the only place a journey's numbers turn into these strings,
 * so all three payment journeys print the same receipt with the same rules.
 *
 * What is NOT here is as deliberate: no `success` flag, no "assume paid"
 * default. A receipt is printed from a charge that happened. Callers that
 * cannot prove one — the confirmation screen before the server answers — get
 * `null` from the builder and print nothing (ORDER_CONFIRMATION_SPEC OC-F-002).
 */

/** A single purchased line: quantity, name, amount. */
export interface ReceiptItem {
  name: string
  qty: number
  /** Pre-formatted, e.g. `£48.00`. `null` prints the name with no amount. */
  amount: string | null
  /** Small second line under the name, e.g. `every 2 months`. */
  note?: string
}

/** A label/value pair printed with a dot leader between the two columns. */
export interface ReceiptRow {
  label: string
  value: string
  /** `saving` prints in the accent ink; `muted` in grey. */
  tone?: 'default' | 'muted' | 'saving'
  strike?: boolean
}

export interface ReceiptData {
  /** Masthead at the top of the paper. */
  merchant: { name: string; strapline: string; site: string }
  /** What kind of receipt this is, e.g. `ORDER RECEIPT`. */
  docTitle: string
  /** ORDER / DATE / EMAIL — printed above the items. */
  meta: ReceiptRow[]
  /** Address lines under a `DELIVER TO` heading. Empty for a plan with no box. */
  shipTo: string[]
  items: ReceiptItem[]
  /** Subtotal, discount, delivery, VAT. */
  adjustments: ReceiptRow[]
  /** The one emphasised line, under a double rule. */
  total: { label: string; value: string } | null
  /** Rows under the total: what recurs, and when it is next taken. */
  charge: ReceiptRow[]
  /**
   * The approval stamp, e.g. `PAYMENT APPROVED`. `null` when money has not
   * actually moved — a placed-but-unsettled order must not print one.
   */
  stamp: string | null
  /** Free-text lines at the foot: schedule, cancellation terms, demo notice. */
  notes: string[]
  /** Printed as a barcode plus its human-readable line. */
  reference: string | null
  footer: string
}
