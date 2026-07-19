'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CHRGDLogo } from '@/components/brand/CHRGDLogo'

interface Props {
  count: number
  onOpenBasket: () => void
}

/** Shop top bar: the CHRGD wordmark and a live basket button. */
export function ShopHeader({ count, onOpenBasket }: Props) {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  return (
    <header className="px-5 pt-6 pb-2 max-w-lg mx-auto flex items-center justify-between">
      <Link href="/" aria-label="getCHRGD home" className="active:scale-95 transition-transform">
        <CHRGDLogo markSize={22} wordClassName="text-lg" />
      </Link>
      <button
        onClick={onOpenBasket}
        className="relative w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-2)' }}
        aria-label={`Open basket, ${count} item${count !== 1 ? 's' : ''}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text)' }}>
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
        </svg>
        {count > 0 && (
          <span
            // Remounting on count change re-triggers the pop — a little "it
            // landed in the basket" bump each time you add something.
            key={reduced ? 'static' : count}
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-black"
            style={{
              background: 'var(--color-accent)', color: 'var(--color-bg)', fontFamily: 'var(--font-display)',
              animation: reduced ? undefined : 'check-pop 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
            }}
          >
            {count}
          </span>
        )}
      </button>
    </header>
  )
}
