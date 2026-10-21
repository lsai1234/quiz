'use client'

import type { StackBlueprint } from '@/lib/stack-blueprint'
import { formatGBP } from '@/lib/stack-blueprint/pricing'

interface Props {
  blueprint: StackBlueprint
  productCount: number
  /** One-off bundle price. */
  totalPrice: number
  /** Monthly subscription price — shown as the headline (with /mo) when the
   *  stack can subscribe; otherwise the one-off price is shown without /mo. */
  monthlyPrice?: number
  canSubscribe?: boolean
}

/**
 * The stack headline. The product lineup itself now lives in the swipeable deck
 * below, so this is deliberately compact: the name and the key facts as chips.
 *
 * Facts only. There used to be a summary sentence ("Designed to support fat
 * loss while preserving lean muscle") and a chip with the primary goal, and
 * both said what the stack is for, which is a health claim. Why each product
 * is here is said in the You scene, through the goal-to-claim map.
 */
export function StackHero({ blueprint, productCount, totalPrice, monthlyPrice, canSubscribe }: Props) {
  const showMonthly = !!canSubscribe && monthlyPrice != null && monthlyPrice > 0
  return (
    <div className="px-5 pt-12 pb-7 max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-[10px] font-bold tracking-[0.25em] uppercase block"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-accent)' }}
        >
          Your CHRGD Stack
        </span>
      </div>
      <h2
        className="text-4xl font-black leading-tight tracking-tight"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
      >
        {blueprint.stackName}
      </h2>

      {/* Stats row */}
      <div className="flex items-center gap-2 mt-4 flex-wrap">
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border-2)', color: 'var(--color-text)' }}
        >
          {/* Layers: a stack of products. */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden>
            <path d="M12 2.5 2.5 7.5 12 12.5l9.5-5z" />
            <path d="M2.5 12 12 17l9.5-5" />
            <path d="M2.5 16.5 12 21.5l9.5-5" />
          </svg>
          {productCount} product{productCount === 1 ? '' : 's'}
        </div>

        <div
          className="px-3 py-1.5 rounded-full text-xs font-black"
          style={{
            background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
            color: 'var(--color-accent)',
          }}
        >
          {showMonthly
            ? <>{formatGBP(monthlyPrice!)}<span className="font-semibold">/mo</span></>
            : <>{formatGBP(totalPrice)}<span className="font-semibold"> one-off</span></>}
        </div>
      </div>
    </div>
  )
}
