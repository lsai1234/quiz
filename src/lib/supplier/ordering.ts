/**
 * Ordering mode — does clicking "Send" in the fulfilment queue actually place a
 * dropship order with PowerBody, or only pretend to?
 *
 * This is deliberately a SEPARATE switch from `SUPPLIER_SOURCE` (./index.ts),
 * and the separation is the whole point. Those two settings answer different
 * questions:
 *
 *   SUPPLIER_SOURCE   — where do products, stock and prices come from?
 *   SUPPLIER_ORDERING — when we send an order, does money and stock move?
 *
 * Tying them together would mean the only way to get a real, live-priced
 * catalogue was to also arm real ordering, so every dry run against the true
 * feed would be one click away from shipping a parcel. Splitting them lets the
 * catalogue run fully live — real products, real stock, kept up to date — while
 * every order is still simulated, which is exactly the state you want to sit in
 * while the integration is being proven. PowerBody expect this too: their guide
 * puts new API accounts in a DEMO/sandbox mode until they have seen the
 * integration place orders correctly.
 *
 * Simulate is the default, and live ordering additionally requires the live
 * supplier: mock SKUs are fixtures, and sending them to PowerBody would place a
 * real order for products that don't exist.
 *
 * Server-only.
 */
import { getSupplierSource } from './index'

export type OrderingMode = 'simulate' | 'live'

// Runtime override set by the portal (Settings → Order sending), persisted in
// the DB and hydrated by `syncPortalRuntime()`. Wins over env so it can be
// flipped without a redeploy — and, more to the point, flipped back fast.
let _runtimeOverride: OrderingMode | null = null

export function setOrderingOverride(mode: OrderingMode | null): void {
  _runtimeOverride = mode
}

export function getOrderingOverride(): OrderingMode | null {
  return _runtimeOverride
}

/** The requested mode, before the supplier source is taken into account. */
export function getOrderingMode(): OrderingMode {
  if (_runtimeOverride) return _runtimeOverride
  const raw = (process.env.SUPPLIER_ORDERING ?? 'simulate').toString().trim().toLowerCase()
  // Only an explicit, exact "live" arms real ordering. Anything else — a typo, a
  // stray value, an unset variable — simulates, because the failure mode of
  // guessing wrong in this direction is a parcel nobody meant to send.
  return raw === 'live' ? 'live' : 'simulate'
}

/**
 * Why real ordering isn't available, or null when it is. Drives the hub's
 * explanation of a toggle that won't take effect, so "I set it to live and
 * nothing changed" is answerable without reading the code.
 */
export function liveOrderingBlockedReason(): string | null {
  if (getSupplierSource() !== 'powerbody') {
    return 'The catalogue is still on the mock supplier, so the SKUs are sample data. Switch Supplier to Live PowerBody first.'
  }
  return null
}

/**
 * What will actually happen on the next send. `live` only when the mode asks for
 * it AND the live supplier is in use; otherwise simulate.
 */
export function getOrderingSource(): OrderingMode {
  if (getOrderingMode() !== 'live') return 'simulate'
  return liveOrderingBlockedReason() === null ? 'live' : 'simulate'
}

/** Convenience boolean for call sites that just need "will this really send?". */
export function isLiveOrdering(): boolean {
  return getOrderingSource() === 'live'
}
