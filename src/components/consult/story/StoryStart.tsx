'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { ResultsBundle } from '@/lib/consult/results'
import { PRICING_SYNCED_EVENT } from '@/lib/pricing/sync-event'
import { startHere, type StartHereItem } from '@/lib/offer/start-here'
import { FREE_GIFT_TERMS_PATH, OFFER_COPY } from '@/lib/offer/copy'
import { titleOf } from '@/lib/offer/results'
import { STORY_COPY } from '@/lib/consult/story-copy'
import { staggerStyle } from '@/lib/consult/motion'
import { useOfferSettings } from '@/hooks/useOfferSettings'
import type { OfferSettings } from '@/lib/offer/settings'
import { Glyph } from '../Glyph'

/**
 * "Start here" in the read's story (plan Phase 8): the hero first, then the
 * classics clicking into battery cells, and the free gift as a cell of its own
 * when this depth qualifies (`startHere`, the results page's own working).
 * Claims verbatim, or none. The gift says its conditions beside it, and the
 * terms are a tap away, as everywhere "free" is said.
 */

const mono = {
  fontFamily: 'var(--amp-font-label)',
  fontSize: 'var(--amp-text-data)',
  letterSpacing: 'var(--amp-tracking-data)',
} as const

export function StoryStart({ bundle, reduced, offer }: { bundle: ResultsBundle; reduced: boolean; /** The workshop's own settings, in place of the shop's. */ offer?: OfferSettings }) {
  const fetched = useOfferSettings()
  const settings = offer ?? fetched.settings
  const ready = Boolean(offer) || fetched.ready
  // Re-worked when the founders' pricing settings land, as the results page is.
  const [priced, setPriced] = useState(0)
  useEffect(() => {
    const bump = () => setPriced((v) => v + 1)
    window.addEventListener(PRICING_SYNCED_EVENT, bump)
    return () => window.removeEventListener(PRICING_SYNCED_EVENT, bump)
  }, [])
  const start = useMemo(
    () =>
      ready
        ? startHere({
            blueprint: bundle.blueprint,
            tiers: { essentials: [...bundle.payload.tiers.essentials], standard: [...bundle.payload.tiers.standard], complete: [...bundle.payload.tiers.complete] },
            snapshot: bundle.offerFit,
            catalogue: bundle.catalogue,
            answers: bundle.answers,
            settings,
            claims: bundle.read.products,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- priced stands in for the module-level pricing config
    [ready, bundle, settings, priced],
  )

  if (!start) {
    return <p style={{ color: 'var(--amp-ink-2)' }}>Working out where to start…</p>
  }

  const cells = start.classics
  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-4)' }} data-story-start>
      {start.hero && <Hero item={start.hero} />}
      {/* The battery, standing up: the classics click into its cells, the gift last. */}
      <div className="flex flex-col items-center">
      <span aria-hidden style={{ width: 'var(--amp-space-10)', height: 'var(--amp-space-2)', borderRadius: 'var(--amp-radius-chip) var(--amp-radius-chip) 0 0', background: 'var(--amp-accent-line)' }} />
      <div
        className="flex w-full flex-col"
        role="list"
        aria-label={start.hero ? 'With the classics' : 'Your stack'}
        style={{ gap: 'var(--amp-space-1)', padding: 'var(--amp-space-1)', borderRadius: 'var(--amp-radius-tile)', border: 'calc(var(--amp-hairline) * 2) solid var(--amp-accent-line)' }}
      >
        {cells.map((c, i) => (
          <div
            key={c.product.id}
            role="listitem"
            data-cell={c.product.id}
            className="amp-anim-pop flex items-center"
            style={{ ...staggerStyle(i + 1, reduced), gap: 'var(--amp-space-2)', minHeight: 'var(--amp-target)', padding: 'var(--amp-space-1) var(--amp-space-3)', borderRadius: 'var(--amp-radius-chip)', background: 'var(--amp-accent-fill)', border: 'var(--amp-hairline) solid var(--amp-accent-line)', fontSize: 'var(--amp-text-meta)', fontWeight: 'var(--amp-weight-medium)' }}
          >
            <span aria-hidden style={{ color: 'var(--amp-accent)' }}>
              <Glyph name="bolt" size={14} />
            </span>
            {titleOf(c.product)}
          </div>
        ))}
        {start.gift && (
          <div
            role="listitem"
            data-cell="gift"
            className="amp-anim-pop flex items-center"
            style={{ ...staggerStyle(cells.length + 1, reduced), gap: 'var(--amp-space-2)', minHeight: 'var(--amp-target)', padding: 'var(--amp-space-1) var(--amp-space-3)', borderRadius: 'var(--amp-radius-chip)', border: 'var(--amp-hairline) dashed var(--amp-go)', color: 'var(--amp-go)', fontSize: 'var(--amp-text-meta)', fontWeight: 'var(--amp-weight-medium)' }}
          >
            <Glyph name="spark" size={14} />
            <span className="uppercase" style={mono}>
              {OFFER_COPY.tierGift}
            </span>
            <span style={{ color: 'var(--amp-ink)' }}>{titleOf(start.gift)}</span>
          </div>
        )}
      </div>
      </div>
      {cells.some((c) => c.claim) && (
        <ul className="flex flex-col" style={{ gap: 'var(--amp-space-1)' }} aria-label="What each is approved to say">
          {cells
            .filter((c) => c.claim)
            .map((c) => (
              <li key={c.product.id} style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>
                <span style={{ color: 'var(--amp-ink)', fontWeight: 'var(--amp-weight-bold)' }}>{titleOf(c.product)}:</span> {c.claim}
              </li>
            ))}
        </ul>
      )}
      {start.gift && (
        <div data-story-gift style={{ padding: 'var(--amp-space-3)', borderRadius: 'var(--amp-radius-tile)', border: 'var(--amp-hairline) solid var(--amp-go-line)', background: 'var(--amp-go-fill)' }}>
          <p style={{ fontWeight: 'var(--amp-weight-bold)' }}>{OFFER_COPY.comesWith(titleOf(start.gift))}</p>
          <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)', marginTop: 'var(--amp-space-1)' }}>
            {OFFER_COPY.bonusConditions(settings.bonus.minSubtotal, settings.bonus.firstOrderOnly)} {OFFER_COPY.bonusNoCode}{' '}
            <Link href={FREE_GIFT_TERMS_PATH} className="underline underline-offset-2" style={{ color: 'var(--amp-ink)' }}>
              {OFFER_COPY.terms}
            </Link>
          </p>
        </div>
      )}
      <p className="sr-only">{STORY_COPY.startHeading}</p>
    </div>
  )
}

function Hero({ item }: { item: StartHereItem }) {
  return (
    <div data-story-hero className="amp-anim-rise" style={{ padding: 'var(--amp-space-4)', borderRadius: 'var(--amp-radius-panel)', border: 'var(--amp-hairline) solid var(--amp-accent-line)', background: 'var(--amp-glass-solid)' }}>
      <p className="uppercase" style={{ ...mono, color: 'var(--amp-accent)' }}>
        {OFFER_COPY.heroLabel}
      </p>
      <p style={{ fontWeight: 'var(--amp-weight-bold)', fontSize: 'var(--amp-text-lead)', marginTop: 'var(--amp-space-1)' }}>{titleOf(item.product)}</p>
      {item.claim && <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)', marginTop: 'var(--amp-space-1)' }}>{item.claim}</p>}
    </div>
  )
}
