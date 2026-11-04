'use client'

import { useState } from 'react'
import { Button, Card, Note } from '@/components/system'
import { REORDER_COPY } from '@/lib/checkin/reorder-copy'
import { formatGBP } from '@/lib/stack-blueprint/pricing'

/**
 * Reorder a one-off box, as it was or without what they've stopped (Option 2).
 * The same checkout as any order: lines go to `/api/cart`, which prices them on
 * the server, and the new order gets its own guide from the same day.
 */
export interface ReorderLine {
  productId: string
  variantId: string
  title: string
  price: number
}

export function ReorderBox({ lines, without, seed }: { lines: ReorderLine[]; without: string[]; seed: unknown }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const total = lines.reduce((n, l) => n + l.price, 0)

  async function go() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: lines.map((l) => ({ variantId: l.variantId, quantity: 1, attributes: [{ key: 'source', value: 'quiz-reorder' }] })),
          guide: seed,
        }),
      })
      const data: { checkoutUrl?: string; orderId?: string; error?: string } | null = await res.json().catch(() => null)
      if (!res.ok || !data?.checkoutUrl) throw new Error(data?.error ?? '')
      window.location.href = data.checkoutUrl.startsWith('#') && data.orderId ? `/order/confirmation?order=${encodeURIComponent(data.orderId)}` : data.checkoutUrl
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : REORDER_COPY.failed)
      setBusy(false)
    }
  }

  return (
    <Card padding="roomy" glow="accent">
      <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-strong)', letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: 'var(--accent)' }}>
        {REORDER_COPY.eyebrow}
      </p>
      <h1 style={{ marginTop: 'var(--space-2)', fontFamily: 'var(--font-display)', fontSize: 'var(--text-display)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)', lineHeight: 'var(--leading-tight)' }}>
        {without.length ? REORDER_COPY.headingWithout : REORDER_COPY.heading}
      </h1>
      {without.length > 0 && <p style={{ marginTop: 'var(--space-2)', color: 'var(--ink-2)', fontSize: 'var(--text-body-sm)' }}>{REORDER_COPY.leftOut(without.join(', '))}</p>}
      <ul style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }} data-reorder-lines>
        {lines.map((l) => (
          <li key={l.productId} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', color: 'var(--ink-1)', fontSize: 'var(--text-body-sm)' }}>
            <span>{l.title}</span>
            <span style={{ color: 'var(--ink-2)' }}>{formatGBP(l.price)}</span>
          </li>
        ))}
      </ul>
      <p style={{ marginTop: 'var(--space-3)', color: 'var(--ink-3)', fontSize: 'var(--text-meta)' }}>{REORDER_COPY.priceNote(formatGBP(total))}</p>
      {error && <Note tone="critical" live="assertive">{error}</Note>}
      <div style={{ marginTop: 'var(--space-4)' }}>
        <Button variant="primary" size="lg" fullWidth loading={busy} disabled={lines.length === 0} onClick={() => void go()}>
          {REORDER_COPY.cta}
        </Button>
      </div>
    </Card>
  )
}
