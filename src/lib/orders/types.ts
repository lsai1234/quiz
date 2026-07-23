/**
 * Order domain types.
 *
 * An order is one purchase (shop, quiz stack, or a subscription delivery) that
 * we fulfil by dropshipping through PowerBody. The full document is stored as
 * JSON in the `orders` table with a few indexed columns for querying (see
 * `repo.ts`). Status walks: pending_payment → paid → submitted_to_supplier →
 * supplier_confirmed → shipped → delivered, with cancelled / refunded / failed
 * as terminal side-exits.
 */
import type { SupplierAddress } from '@/lib/supplier/types'

export type OrderChannel = 'shop' | 'quiz' | 'subscription'

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'submitted_to_supplier'
  | 'supplier_confirmed'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'failed'

export interface OrderLine {
  /** Supplier SKU — needed to place the dropship order. Null if unknown. */
  sku: string | null
  productId: string
  title: string
  variantTitle?: string | null
  quantity: number
  /** What the customer paid per unit. */
  unitPrice: number
  /** What we pay the supplier per unit (margin tracking). Null if unknown. */
  supplierCost?: number | null
}

/** An audit entry appended on every meaningful transition. */
export interface OrderEvent {
  at: string
  type: string
  detail?: string
}

export interface Order {
  id: string
  channel: OrderChannel
  status: OrderStatus
  userId: string | null
  email: string | null
  currency: string
  subtotal: number
  shipping: number
  total: number
  lines: OrderLine[]
  shippingAddress: SupplierAddress | null
  // ── Payment (Stripe) ──
  stripeSessionId: string | null
  stripePaymentIntentId: string | null
  // ── Supplier fulfilment (PowerBody) ──
  supplierOrderId: string | null
  supplierStatus: string | null
  trackingNumber: string | null
  // ── Audit ──
  events: OrderEvent[]
  createdAt: string
  updatedAt: string
}

/** What `createOrderFromCheckout` needs to raise a paid order. */
export interface CreateOrderInput {
  id?: string
  channel: OrderChannel
  userId?: string | null
  email?: string | null
  currency?: string
  lines: OrderLine[]
  shipping?: number
  shippingAddress?: SupplierAddress | null
  status?: OrderStatus
  stripeSessionId?: string | null
  stripePaymentIntentId?: string | null
}
