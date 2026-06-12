'use client'

import type { StackBlueprint } from '@/lib/stack-blueprint'

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
        className="text-[10px] font-bold tracking-[0.25em] uppercase text-[var(--color-accent)] mb-4 block"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Your CHRGD Stack
      </span>
      <h2
        className="text-4xl font-black leading-tight tracking-tight text-[var(--color-text)]"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {blueprint.stackName}
      </h2>
      <p className="text-sm text-[var(--color-text-2)] mt-3 leading-relaxed">
        {blueprint.summary}
      </p>

      {/* Stats row */}
      <div className="flex items-center gap-3 mt-5 flex-wrap">
        <span className="px-3 py-1.5 rounded-full text-xs font-semibold border border-[var(--color-border)] text-[var(--color-text-2)]">
          {productCount} products
        </span>
        <span className="px-3 py-1.5 rounded-full text-xs font-bold border border-[var(--color-border)] text-[var(--color-text)]">
          £{totalPrice.toFixed(2)}
        </span>
        <span
          className="px-3 py-1.5 rounded-full text-xs font-bold"
          style={{
            color: 'var(--color-accent)',
            background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
          }}
        >
          {prettifyGoal(blueprint.primaryGoal)}
        </span>
      </div>
    </div>
  )
}
