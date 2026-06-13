'use client'

import type { StackBlueprint } from '@/lib/stack-blueprint'
import { formatGBP } from '@/lib/stack-blueprint/pricing'

interface Props {
  blueprint: StackBlueprint
  productCount: number
  totalPrice: number
}

function prettifyGoal(goal: string) {
  return goal.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function StackHero({ blueprint, productCount, totalPrice }: Props) {
  return (
    <div className="px-5 pt-12 pb-8 max-w-lg mx-auto">
      <span
        className="text-[10px] font-bold tracking-[0.25em] uppercase mb-4 block"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--color-accent)' }}
      >
        Your CHRGD Stack
      </span>
      <h2
        className="text-4xl font-black leading-tight tracking-tight"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
      >
        {blueprint.stackName}
      </h2>
      <p className="text-sm mt-3 leading-relaxed" style={{ color: 'var(--color-text-2)' }}>
        {blueprint.summary}
      </p>

      {/* Stats row */}
      <div className="flex items-center gap-2 mt-5 flex-wrap">
        {/* Product count */}
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
          style={{
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border-2)',
            color: 'var(--color-text)',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 3.5v2.5l1.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {productCount} products
        </div>

        {/* Price */}
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

        {/* Primary goal */}
        <div
          className="px-3 py-1.5 rounded-full text-xs font-semibold"
          style={{
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border-2)',
            color: 'var(--color-text-2)',
          }}
        >
          {prettifyGoal(blueprint.primaryGoal)}
        </div>
      </div>
    </div>
  )
}
