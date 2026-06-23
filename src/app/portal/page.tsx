'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ProductReadiness } from '@/lib/portal/readiness'

const ACCENT = '#00D4FF'

interface Row { product: { id: string }; readiness: ProductReadiness }

export default function PortalHome() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [source, setSource] = useState<string>('')

  useEffect(() => {
    fetch('/api/portal/products').then((r) => r.json()).then((d) => { setRows(d.products ?? []); setSource(d.source) }).catch(() => setRows([]))
  }, [])

  const total = rows?.length ?? 0
  const ready = rows?.filter((r) => r.readiness.overall === 'ok').length ?? 0
  const attention = rows?.filter((r) => r.readiness.overall === 'fail').length ?? 0
  const warn = rows?.filter((r) => r.readiness.overall === 'warn').length ?? 0

  const cards = [
    { href: '/portal/products', title: 'Products', desc: 'Edit tags, subscription settings, cost and recommendation basis.' },
    { href: '/portal/pricing', title: 'Pricing rules', desc: 'Discount tiers, subscription offer, margins — with a profit preview.' },
    { href: '/portal/readiness', title: 'Readiness', desc: 'See which products are launch-ready vs need attention.' },
    { href: '/portal/settings', title: 'Settings', desc: 'Flip between mock and live Shopify data.' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Control centre</h1>
      <p className="text-sm text-[var(--color-muted)] mb-5">
        Serving <strong style={{ color: 'var(--color-text)' }}>{source === 'shopify' ? 'live Shopify' : 'mock'}</strong> data.
      </p>

      {/* Counts */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { n: total, l: 'Products', c: 'var(--color-text)' },
          { n: ready, l: 'Launch-ready', c: '#34d399' },
          { n: attention + warn, l: 'Need attention', c: attention > 0 ? 'var(--color-red)' : '#fbbf24' },
        ].map((s) => (
          <div key={s.l} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 text-center">
            <p className="text-2xl font-black" style={{ color: s.c, fontFamily: 'var(--font-display)' }}>{rows === null ? '…' : s.n}</p>
            <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{s.l}</p>
          </div>
        ))}
      </div>

      {/* Nav cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 active:scale-[0.99] transition-all">
            <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>{c.title}</p>
            <p className="text-xs text-[var(--color-muted)] mt-1 leading-relaxed">{c.desc}</p>
            <span className="text-xs font-bold mt-2 inline-block" style={{ color: ACCENT }}>Open →</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
