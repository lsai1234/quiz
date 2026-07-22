/**
 * Payments resolver (Stripe)
 * ──────────────────────────
 * Single decision point for whether checkout (shop, quiz and subscriptions) is
 * taken through MOCK payments or LIVE Stripe. The payments-side twin of
 * `src/lib/data-source.ts`, kept deliberately identical in shape.
 *
 * Resolution order (highest priority first):
 *   1. Portal runtime override  — set from the Founders Hub, persisted in the DB
 *   2. Explicit env             — PAYMENTS_SOURCE = mock | stripe | auto
 *   3. Default                  — MOCK (mock-first while Stripe is being wired up)
 *
 * Mock is the default ON PURPOSE: checkout returns a `#mock-checkout` placeholder
 * so the whole flow works without Stripe keys. Flipping `PAYMENTS_SOURCE=stripe`
 * (with keys present) is all it takes to go live — every checkout entry point
 * calls the payments layer, never the Stripe SDK directly.
 *
 * Server-only: sessions and webhooks are created in route handlers. The
 * publishable key is still exposed to the client via `NEXT_PUBLIC_*` for
 * Stripe.js, but the mock-vs-live *decision* lives here, server-side.
 */

export type PaymentSource = 'mock' | 'stripe'
export type PaymentMode = 'auto' | 'mock' | 'stripe'

/** True when the Stripe secret key is configured (server-side auth). */
export function hasStripeCredentials(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

// Runtime override set by the portal (server in-memory, hydrated from the DB by
// `syncPortalRuntime()`). Takes precedence over env so payments can be flipped
// without a redeploy.
let _runtimeOverride: PaymentMode | null = null

export function setPaymentOverride(mode: PaymentMode | null): void {
  _runtimeOverride = mode
}

export function getPaymentOverride(): PaymentMode | null {
  return _runtimeOverride
}

/**
 * The requested mode, before credentials are taken into account.
 * Order: portal runtime override → env → `mock` default.
 */
export function getPaymentMode(): PaymentMode {
  if (_runtimeOverride) return _runtimeOverride
  const raw = (process.env.PAYMENTS_SOURCE ?? 'mock').toString().trim().toLowerCase()

  if (raw === 'stripe') return 'stripe'
  if (raw === 'auto') return 'auto'
  // Default and anything unrecognised → mock (mock-first).
  return 'mock'
}

/**
 * The effective payment processor to use right now.
 * A forced `stripe` mode still falls back to mock when the secret key is
 * missing — there is nothing to charge against without it.
 */
export function getPaymentSource(): PaymentSource {
  const mode = getPaymentMode()

  if (mode === 'mock') return 'mock'

  if (mode === 'stripe') {
    if (hasStripeCredentials()) return 'stripe'
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '[payments] PAYMENTS_SOURCE=stripe but Stripe credentials are missing — falling back to mock.',
      )
    }
    return 'mock'
  }

  // auto
  return hasStripeCredentials() ? 'stripe' : 'mock'
}

/** Convenience boolean for call sites that just need "is live Stripe?". */
export function isStripeLive(): boolean {
  return getPaymentSource() === 'stripe'
}
