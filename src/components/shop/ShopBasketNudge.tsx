'use client'

import Link from 'next/link'
import type { BasketNudge } from '@/lib/shop/basket-alchemy'
import { formatGBP } from '@/lib/stack-blueprint/pricing'

interface Props {
  nudge: BasketNudge
  /** Fired when the shopper follows the suggestion — the link navigates itself. */
  onAct: () => void
  onDismiss: () => void
}

/**
 * One line about what this basket is close to being.
 *
 * ── Why a bundle nudge links out instead of adding to the basket ─────────────
 * A bundle is a separate purchase on its own page: `BundleLandingPage` checks
 * out through `useStackCheckout`, not through the shop basket. So adding the
 * missing product to the basket would NOT get the bundle price, and buying the
 * bundle does NOT empty the basket.
 *
 * That leaves exactly one honest thing to do — say what is true and let the
 * shopper decide. It must never read as "add this and save £6.40", because the
 * basket would then charge the full à la carte price and the promise would be a
 * lie at the till; and it has to say that bundles are bought separately, or
 * someone follows it, buys the bundle, and finds the loose products still sitting
 * in their basket.
 *
 * If the two checkouts are ever unified, this copy should be revisited — not
 * before.
 */
export function ShopBasketNudge({ nudge, onAct, onDismiss }: Props) {
  const body =
    nudge.kind === 'bundle' ? <BundleBody nudge={nudge} />
      : nudge.kind === 'overlap' ? <OverlapBody nudge={nudge} />
        : <DeliveryBody nudge={nudge} />

  // An overlap is not an offer, so it does not wear the accent an offer wears.
  const offerish = nudge.kind !== 'overlap'

  return (
    <div
      className="flex items-center gap-2 rounded-xl pl-3 pr-1.5 py-2 max-w-lg mx-auto w-full"
      style={{
        background: offerish
          ? 'color-mix(in srgb, var(--accent) 9%, var(--surface))'
          : 'var(--surface)',
        border: `1px solid ${offerish ? 'color-mix(in srgb, var(--accent) 26%, transparent)' : 'var(--line)'}` }}
    >
      {nudge.kind === 'bundle' ? (
        <Link href={`/bundles/${nudge.slug}`} onClick={onAct} className="flex-1 min-w-0 active:opacity-80">
          {body}
        </Link>
      ) : (
        <div className="flex-1 min-w-0">{body}</div>
      )}

      <button
        onClick={onDismiss}
        aria-label="Dismiss suggestion"
        className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center active:scale-90 transition-transform"
        style={{ color: 'var(--text-dim)' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

/**
 * A bundle leads on its price ONLY when there is a price to lead on.
 *
 * `saving` is the bundle against the same products through the basket, after the
 * basket's own tier discount — so it is often zero, and saying "£6.48 less"
 * there would be advertising the £50+ tier the shopper already earns. With no
 * edge, the true and still-useful thing is that this is a curated stack they are
 * one product from completing.
 */
function BundleBody({ nudge }: { nudge: Extract<BasketNudge, { kind: 'bundle' }> }) {
  const total = nudge.have + nudge.missing.length
  const missing = nudge.missing.map((p) => p.shortName || p.title)
  const missingList = missing.length === 2 ? `${missing[0]} and ${missing[1]}` : missing[0]

  return (
    <>
      <p className="text-xs font-medium leading-snug" style={{ color: 'var(--text)' }}>
        {nudge.saving > 0
          ? `${nudge.name} — ${formatGBP(nudge.saving)} less as a bundle`
          : `${nudge.have} of the ${total} in the ${nudge.name}`}
        <span aria-hidden> →</span>
      </p>
      <p className="text-[11px] leading-snug mt-0.5" style={{ color: 'var(--text-dim)' }}>
        {nudge.saving > 0
          ? `You have ${nudge.have} of its ${total}. Bundles are bought on their own page.`
          : `Add ${missingList} for the full stack. Bundles are bought on their own page.`}
      </p>
    </>
  )
}

/**
 * The overlap line. Reads as information, not as an offer — no accent, no arrow,
 * nowhere to tap. It exists to help someone buy LESS, and dressing that as a
 * promotion would be the wrong shape entirely.
 */
function OverlapBody({ nudge }: { nudge: Extract<BasketNudge, { kind: 'overlap' }> }) {
  return (
    <>
      <p className="text-xs font-medium leading-snug" style={{ color: 'var(--text)' }}>
        Two of these overlap
      </p>
      <p className="text-[11px] leading-snug mt-0.5" style={{ color: 'var(--text-dim)' }}>
        {nudge.sentence} You may only need one.
      </p>
    </>
  )
}

function DeliveryBody({ nudge }: { nudge: Extract<BasketNudge, { kind: 'delivery' }> }) {
  // The same ladder the drawer draws, promoted to where there is still something
  // to add. Both read from the pricing config, so they cannot disagree.
  const progress = Math.min(1, 1 - nudge.remaining / nudge.threshold)
  return (
    <>
      <p className="text-xs font-medium leading-snug" style={{ color: 'var(--text)' }}>
        {formatGBP(nudge.remaining)} from free delivery
      </p>
      <div className="h-1 rounded-full overflow-hidden mt-1.5" style={{ background: 'var(--surface-hi)' }}>
        <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: 'var(--accent)' }} />
      </div>
    </>
  )
}
