'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { StackBlueprint } from '@/lib/stack-blueprint'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { ProductTile } from './ProductTile'

gsap.registerPlugin(ScrollTrigger)

/** One product on the lineup shelf. */
export interface HeroTile {
  slotType: string
  imageUrl: string | null
  title: string
}

interface Props {
  blueprint: StackBlueprint
  productCount: number
  totalPrice: number
  /** The stack's products, in display order — the lineup shown on the shelf. */
  tiles: HeroTile[]
  /** CHRGD LQD (all-drinks package) framing. */
  drinksMode?: boolean
}

function prettifyGoal(goal: string) {
  return goal.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function StackHero({ blueprint, productCount, totalPrice, tiles, drinksMode }: Props) {
  const shelfRef = useRef<HTMLDivElement>(null)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  // The lineup reveal: product tiles stagger onto the shelf as it scrolls into
  // view — the payoff beat of the whole quiz. Honours reduced-motion by simply
  // leaving the tiles in place.
  useEffect(() => {
    if (reduced || !shelfRef.current) return
    const els = shelfRef.current.querySelectorAll('[data-tile]')
    if (els.length === 0) return
    const anim = gsap.fromTo(
      els,
      { y: 22, opacity: 0, scale: 0.8 },
      {
        y: 0, opacity: 1, scale: 1,
        duration: 0.55, ease: 'back.out(1.5)', stagger: 0.08,
        scrollTrigger: { trigger: shelfRef.current, start: 'top 85%', once: true },
      },
    )
    return () => { anim.scrollTrigger?.kill(); anim.kill() }
  }, [reduced])

  return (
    <div className="px-5 pt-12 pb-8 max-w-lg mx-auto">
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
      <p className="text-sm mt-2.5 leading-relaxed line-clamp-1" style={{ color: 'var(--color-text-2)' }}>
        {blueprint.summary}
      </p>

      {/* The lineup shelf — the hero visual */}
      {tiles.length > 0 && (
        <div
          className="mt-5 rounded-2xl px-4 pt-5 pb-6 relative overflow-hidden"
          style={{
            background: 'radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--color-accent) 10%, transparent), transparent 70%), var(--color-surface-2)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div ref={shelfRef} className="flex flex-wrap justify-center items-end gap-3">
            {tiles.map((t, i) => (
              <div key={i} data-tile>
                <ProductTile imageUrl={t.imageUrl} slot={t.slotType} title={t.title} size={68} />
              </div>
            ))}
          </div>
          {/* Shelf line the tiles stand on */}
          <div
            className="absolute left-6 right-6 bottom-4 h-px"
            style={{ background: 'linear-gradient(to right, transparent, var(--color-border-2), transparent)' }}
          />
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-2 mt-4 flex-wrap">
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
