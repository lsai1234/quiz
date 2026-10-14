/**
 * Fired on `window` once the portal's pricing overrides have reached the
 * browser (`PortalSync`).
 *
 * `setPricingOverrides` changes module state and tells nobody, which is fine
 * for anything read at the moment of use — and wrong for a figure computed on
 * mount and memoised, like the last-chance deal: on a resumed session it can be
 * worked out on the defaults before the founders' settings land, and then
 * shown until something else re-renders it. Listening for this re-works it.
 */
export const PRICING_SYNCED_EVENT = 'chrgd:pricing-synced'
