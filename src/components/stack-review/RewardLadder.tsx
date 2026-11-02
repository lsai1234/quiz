'use client'

import type { CatalogueProduct } from '@/lib/catalogue/types'
import { shortNameOf } from '@/lib/catalogue/short-name'
import { productTypeLabel } from '@/lib/catalogue/product-type'
import { FREE_GIFT_TERMS_PATH, OFFER_COPY } from '@/lib/offer/copy'
import type { Ladder } from '@/lib/offer/ladder'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import Link from 'next/link'

/**
 * Build your stack (the clarity pass): what this stack has unlocked and what
 * the next line is, with a bar towards it and a few products to add in one
 * tap. Every line is one checkout already applies (`rewardLadder`), so
 * nothing here can promise what the order won't get; the gift keeps its
 * conditions beside it (CAP Code 3.23–3.25).
 *
 * The products offered are the stack's own add-ons (`boosters`): in stock,
 * clear of every exclusion, named by name and type only, never by what they
 * do.
 */
export function RewardLadder({
  ladder,
  addOns,
  onAdd,
  giftConditions,
}: {
  ladder: Ladder
  addOns: readonly CatalogueProduct[]
  onAdd: (product: CatalogueProduct) => void
  /** The gift's conditions, said beside it whenever it is on the ladder. */
  giftConditions: string | null
}) {
  if (ladder.rungs.length === 0) return null
  const { next } = ladder
  return (
    <section aria-labelledby="ladder-heading" className="px-5 max-w-lg mx-auto" data-ladder={next ? next.kind : 'all'}>
      <div className="rounded-2xl px-4 py-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <p id="ladder-heading" className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>
          {OFFER_COPY.ladderHeading}
        </p>
        <p className="mt-1.5 text-[15px] font-bold leading-snug" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          {next ? OFFER_COPY.ladderNext(next.toGo, next.label) : OFFER_COPY.ladderAll}
        </p>
        {next && (
          <div className="mt-2.5 h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }} aria-hidden>
            <div className="h-full rounded-full" style={{ width: `${Math.round(ladder.progress * 100)}%`, background: 'var(--color-accent)' }} />
          </div>
        )}

        <ul className="mt-3.5 space-y-2" aria-label={OFFER_COPY.ladderHeading}>
          {ladder.rungs.map((r) => (
            <li key={`${r.kind}-${r.at}`} className="flex items-start gap-2.5" data-rung={r.kind} data-reached={r.reached}>
              <span
                aria-hidden
                className="mt-0.5 inline-flex flex-shrink-0 items-center justify-center rounded-full"
                style={{
                  width: 18,
                  height: 18,
                  background: r.reached ? 'var(--color-accent)' : 'transparent',
                  border: r.reached ? 'none' : '1.5px solid var(--color-border-2)',
                  color: 'var(--color-bg)',
                }}
              >
                {r.reached && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
                  </svg>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug" style={{ color: r.reached ? 'var(--color-text)' : 'var(--color-text-2)' }}>
                  <span className="font-semibold">{r.label}</span>{' '}
                  <span style={{ color: 'var(--color-muted)' }}>{r.condition}</span>
                </p>
                {r.kind === 'gift' && giftConditions && (
                  <p className="mt-0.5 text-[11px] leading-snug" style={{ color: 'var(--color-muted)' }}>
                    {giftConditions}{' '}
                    <Link href={FREE_GIFT_TERMS_PATH} className="underline underline-offset-2 font-semibold" style={{ color: 'var(--color-text-2)' }}>
                      {OFFER_COPY.terms}
                    </Link>
                  </p>
                )}
              </div>
              <span className="flex-shrink-0 text-[12px] font-semibold tabular-nums" style={{ color: r.reached ? 'var(--color-accent)' : 'var(--color-text-2)' }}>
                {r.reached ? OFFER_COPY.ladderUnlocked : OFFER_COPY.ladderToGo(r.toGo)}
              </span>
            </li>
          ))}
        </ul>

        {next && addOns.length > 0 && (
          <div className="mt-4 pt-3.5" style={{ borderTop: '1px solid var(--color-border)' }}>
            <p className="text-[12px] font-semibold" style={{ color: 'var(--color-text-2)' }}>
              {OFFER_COPY.ladderAdd}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {addOns.slice(0, 3).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onAdd(p)}
                    className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-semibold active:scale-95 transition-transform"
                    style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border-2)', color: 'var(--color-text)' }}
                    aria-label={`Add ${p.title}, ${formatGBP(p.basePrice)}`}
                  >
                    <span aria-hidden style={{ color: 'var(--color-accent)' }}>+</span>
                    {shortNameOf(p)}
                    <span style={{ color: 'var(--color-muted)' }}>
                      {productTypeLabel(p) && !shortNameOf(p).toLowerCase().includes(productTypeLabel(p).toLowerCase()) ? `· ${productTypeLabel(p)} ` : ''}· {formatGBP(p.basePrice)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
