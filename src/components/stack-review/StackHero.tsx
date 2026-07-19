'use client'

import type { StackBlueprint } from '@/lib/stack-blueprint'
import { formatGBP } from '@/lib/stack-blueprint/pricing'

interface Props {
  blueprint: StackBlueprint
  productCount: number
  totalPrice: number
  /** CHRGD LQD (all-drinks package) framing. */
  drinksMode?: boolean
}

function prettifyGoal(goal: string) {
  return goal.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * The stack headline. The product lineup itself now lives in the swipeable deck
 * below, so this is deliberately compact — name, one supporting line, and the
 * key stats as chips.
 */
export function StackHero({ blueprint, productCount, totalPrice, drinksMode }: Props) {
  return (
    <div className="px-5 pt-12 pb-7 max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-[10px] font-bold tracking-[0.25em] uppercase block"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-accent)' }}
        >
          {drinksMode ? 'Your CHRGD LQD Package' : 'Your CHRGD Stack'}
        </span>
        {blueprint.personalised && (
          <span
            className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--color-accent)',
              background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
            }}
          >
            ✦ AI personalised
          </span>
        )}
      </div>
      <h2
        className="text-4xl font-black leading-tight tracking-tight"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
      >
        {blueprint.stackName}
      </h2>
      <p className="text-sm mt-2.5 leading-relaxed line-clamp-2" style={{ color: 'var(--color-text-2)' }}>
        {blueprint.summary}
      </p>

      {/* Stats row */}
      <div className="flex items-center gap-2 mt-4 flex-wrap">
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border-2)', color: 'var(--color-text)' }}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 3.5v2.5l1.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {productCount} products
        </div>

        <div
          className="px-3 py-1.5 rounded-full text-xs font-black"
          style={{
            background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
            color: 'var(--color-accent)',
          }}
        >
          {formatGBP(totalPrice)}/mo
        </div>

        <div
          className="px-3 py-1.5 rounded-full text-xs font-semibold"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border-2)', color: 'var(--color-text-2)' }}
        >
          {prettifyGoal(blueprint.primaryGoal)}
        </div>
      </div>
    </div>
  )
}
