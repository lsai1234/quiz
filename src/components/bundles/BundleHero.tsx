'use client'

import type { PrebuiltBundle } from '@/lib/bundles'
import { formatGBP } from '@/lib/stack-blueprint/pricing'

interface Props {
  bundle: PrebuiltBundle
  productCount: number
  totalPrice: number
}

export function BundleHero({ bundle, productCount, totalPrice }: Props) {
  return (
    <div className="px-5 pt-12 pb-8 max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span
          className="text-[10px] font-bold tracking-[0.25em] uppercase block"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-accent)' }}
        >
          CHRGD Prebuilt Stack
        </span>
        <span
          className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase"
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--color-accent)',
            background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
          }}
        >
          {bundle.seriesName}
        </span>
      </div>

      <h1
        className="text-4xl font-black leading-tight tracking-tight"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
      >
        {bundle.name}
      </h1>

      <p
        className="text-sm font-bold tracking-[0.18em] uppercase mt-3"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--color-accent)' }}
      >
        {bundle.tagline}
      </p>

      <p className="text-sm mt-3 leading-relaxed" style={{ color: 'var(--color-text-2)' }}>
        {bundle.description}
      </p>

      {/* Stats row */}
      <div className="flex items-center gap-2 mt-5 flex-wrap">
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

        <div
          className="px-3 py-1.5 rounded-full text-xs font-black"
          style={{
            background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
            color: 'var(--color-accent)',
          }}
        >
          {formatGBP(totalPrice)}
        </div>

        <div
          className="px-3 py-1.5 rounded-full text-xs font-semibold"
          style={{
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border-2)',
            color: 'var(--color-text-2)',
          }}
        >
          Workout included
        </div>
      </div>

      {/* The honest line — cheeky, and keeps the claims safe */}
      <p className="text-xs mt-5 italic" style={{ color: 'var(--color-muted)' }}>
        {bundle.honestyLine}
      </p>
    </div>
  )
}
