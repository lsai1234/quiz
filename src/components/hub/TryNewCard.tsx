'use client'

import { useState } from 'react'
import { Button, Card, Note } from '@/components/system'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import type { TryOffer } from '@/lib/hub/try-new'
import { boxDateLabel } from '@/lib/hub/line-facts'

/**
 * "Try something new": one product a plan member doesn't have, at a first-time
 * price in their next box (`hub/try-new`, priced and re-checked by the server).
 * Said plainly, with no countdown and no "only today": it's there until they
 * add it or say it's not for them, and then the next one, if there is one.
 */

const heading = { fontSize: 'var(--text-body)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' } as const
const body = { fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-2)' } as const

export function TryNewCard({
  offer,
  onAdd,
  onDismiss,
  onTaken,
}: {
  /** The product on offer (`useBoxPerks`), or null. */
  offer: TryOffer | null
  /** Put it in the next box at its first-time price (through the hub's save queue). */
  onAdd: (productId: string, variantId: string) => Promise<{ ok: boolean; message: string }>
  onDismiss: (productId: string) => void
  /** It went in, or was turned down: stop showing it. */
  onTaken: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ ok: boolean; message: string } | null>(null)

  if (!offer && !said) return null

  async function add() {
    if (!offer || busy) return
    setBusy(true)
    setSaid(null)
    const result = await onAdd(offer.productId, offer.variantId)
    if (result.ok) {
      setSaid({ ok: true, message: `${result.message} If you like it, you can add it to every box from your plan.` })
      onTaken()
    } else {
      setSaid({ ok: false, message: result.message })
    }
    setBusy(false)
  }

  return (
    <div data-try-new>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <p style={heading}>Try something new</p>
          {offer && (
            <>
              <div className="flex items-start" style={{ gap: 'var(--space-3)' }}>
                <ProductTile imageUrl={offer.imageUrl ?? undefined} title={offer.title} size={48} />
                <p style={body}>
                  <span style={{ color: 'var(--ink-1)' }}>{offer.title}</span> in your box on {boxDateLabel(offer.box.date)} for{' '}
                  <strong style={{ color: 'var(--ink-1)' }}>{formatGBP(offer.price)}</strong> (usually {formatGBP(offer.usual)}). A first-time price, once
                  per product, added to that box’s payment.
                </p>
              </div>
              <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
                <Button variant="primary" size="sm" icon="plus" onClick={add} disabled={busy} loading={busy}>
                  Add to my next box
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { onDismiss(offer.productId); onTaken() }} disabled={busy}>
                  Not for me
                </Button>
              </div>
            </>
          )}
          {said && (
            <Note tone={said.ok ? 'positive' : 'attention'} live="polite">
              {said.message}
            </Note>
          )}
        </div>
      </Card>
    </div>
  )
}
