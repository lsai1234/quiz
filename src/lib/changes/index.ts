/**
 * Product changes on live subscriptions — public surface.
 *
 * A product going out of stock, being discontinued, or moving price at the
 * supplier all become one `ChangeEvent`, carrying the action the system intends
 * and the moment it lands without anyone intervening.
 *
 * See docs/PRODUCT_CHANGES_SPEC.md. Detection (`detect.ts`) and orchestration
 * (`service.ts`) land in P4; this is the domain they'll build on.
 */
export * from './types'
export * from './safety'
export * from './policy'
export * from './apply'
export * from './event'
// `repo.ts` is server-only (touches the database) — import it directly.
