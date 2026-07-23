/**
 * Stock-exception types.
 *
 * A stock exception is a line on an ACTIVE subscription whose product has gone
 * out of stock at the supplier — surfaced in the Founders Hub stock-alerts
 * queue for a founder to resolve per the member's substitution consent. Stored
 * in the `stock_exceptions` table (migration v3), one JSON doc per row.
 */
import type { SwapGroup } from '@/lib/catalogue/types'

export type StockExceptionStatus = 'open' | 'resolved'
export type StockResolution = 'substituted' | 'skipped' | 'notified'

export interface StockException {
  id: string
  userId: string
  customerEmail: string | null
  subscriptionId: string
  lineId: string
  productId: string
  productTitle: string
  sku: string | null
  slotTitle: string
  swapGroup: SwapGroup
  /** The member's consent for this line at the time of the check. */
  allowSubstitution: boolean
  /** The best in-stock same-category replacement, when one exists. */
  suggestedReplacementId: string | null
  suggestedReplacementTitle: string | null
  status: StockExceptionStatus
  resolution?: StockResolution
  resolutionDetail?: string
  createdAt: string
  resolvedAt?: string | null
}
