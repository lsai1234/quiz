'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Checkbox, Note } from '@/components/system'

/**
 * Change one item on an order that has not gone to PowerBody yet — the answer
 * to "this one sold out after they paid". See `lib/orders/line-changes`.
 *
 * Three ways out, in the order most customers would want them: the closest
 * like-for-like swap, the rest now and this one later, or off the order and
 * refunded. Anything that moves money asks twice, and says how much.
 */

interface Replacement {
  productId: string
  variantId: string
  sku: string
  title: string
  variantTitle: string | null
  price: number
  difference: number
  stock: number | null
  confirmed: boolean
}

interface Options {
  value: number
  live: { stock: number; inStock: boolean } | null
  replacements: Replacement[]
  onlyLine: boolean
}

const gbp = (n: number) => `£${n.toFixed(2)}`

const meta = { fontSize: 'var(--text-meta)', color: 'var(--ink-3)', lineHeight: 'var(--leading-snug)' } as const

function differenceLabel(r: Replacement): string {
  if (Math.abs(r.difference) < 0.005) return 'same price'
  return r.difference < 0 ? `${gbp(-r.difference)} cheaper — we refund the gap` : `${gbp(r.difference)} dearer — on us`
}

export function OrderLineChange({
  orderId,
  index,
  sku,
  firstName,
  onChanged,
  onClose,
}: {
  orderId: string
  index: number
  sku: string | null
  firstName: string | null
  /** The order as it is after the change. */
  onChanged: (order: unknown) => void
  onClose: () => void
}) {
  const [options, setOptions] = useState<Options | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [notify, setNotify] = useState(true)

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/portal/orders/${orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line: index, sku, ...body }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'That did not work.')
      return d
    },
    [orderId, index, sku],
  )

  useEffect(() => {
    let live = true
    post({ action: 'line-options' })
      .then((d) => live && setOptions(d.options as Options))
      .catch((err: Error) => live && setError(err.message))
    return () => {
      live = false
    }
  }, [post])

  async function act(key: string, body: Record<string, unknown>, needsConfirm: boolean) {
    if (needsConfirm && confirming !== key) {
      setConfirming(key)
      return
    }
    setBusy(key)
    setError(null)
    try {
      const d = await post({ ...body, notify })
      onChanged(d.order)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.')
    } finally {
      setBusy(null)
      setConfirming(null)
    }
  }

  const who = firstName ?? 'the customer'

  return (
    <div
      className="flex flex-col"
      style={{
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        background: 'var(--surface-2)',
        borderRadius: 'var(--radius-row)',
        marginTop: 'var(--space-2)',
      }}
    >
      {!options && !error && <p style={meta}>Asking PowerBody about this item and the closest replacements…</p>}
      {error && (
        <Note tone="critical" icon="alert-triangle" live="assertive">
          {error}
        </Note>
      )}

      {options && (
        <>
          <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-2)', lineHeight: 'var(--leading-loose)' }}>
            {options.live
              ? options.live.inStock && options.live.stock > 0
                ? `PowerBody have ${options.live.stock} of these right now — it can be sent as it is.`
                : 'PowerBody have none of these right now.'
              : 'PowerBody did not say how many they have — treat it as unavailable if the last send was refused.'}
          </p>

          <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
            <p style={{ ...meta, fontWeight: 'var(--weight-strong)', color: 'var(--ink-2)' }}>Swap it for the closest match</p>
            {options.replacements.length === 0 ? (
              <p style={meta}>
                Nothing like-for-like is in stock — same kind of product, and keeping everything the original promised
                (diet, stimulant-free, safety warnings).
              </p>
            ) : (
              options.replacements.map((r) => {
                const key = `swap:${r.variantId}`
                const refunds = r.difference < -0.005
                return (
                  <div key={r.variantId} className="flex items-center justify-between flex-wrap" style={{ gap: 'var(--space-2)' }}>
                    <div className="min-w-0">
                      <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)', overflowWrap: 'anywhere' }}>
                        {r.title}
                        {r.variantTitle ? ` · ${r.variantTitle}` : ''}
                      </p>
                      <p style={meta}>
                        {gbp(r.price)} · {differenceLabel(r)}
                        {r.stock != null ? ` · ${r.stock} in stock${r.confirmed ? '' : ' (catalogue)'}` : ''}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      loading={busy === key}
                      disabled={busy !== null}
                      onClick={() =>
                        void act(key, { action: 'line-swap', productId: r.productId, variantId: r.variantId }, refunds)
                      }
                    >
                      {confirming === key ? `Confirm — refund ${gbp(-r.difference)}` : 'Swap'}
                    </Button>
                  </div>
                )
              })
            )}
          </div>

          <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
            <Button
              size="sm"
              loading={busy === 'backorder'}
              disabled={busy !== null}
              onClick={() => void act('backorder', { action: 'line-backorder' }, false)}
            >
              {options.onlyLine ? 'Wait for it to come back' : 'Send the rest now, this later'}
            </Button>
            {!options.onlyLine && (
              <Button
                variant="destructive"
                size="sm"
                loading={busy === 'remove'}
                disabled={busy !== null}
                onClick={() => void act('remove', { action: 'line-remove' }, true)}
              >
                {confirming === 'remove' ? `Confirm — refund ${gbp(options.value)}` : `Remove and refund ${gbp(options.value)}`}
              </Button>
            )}
            <Button variant="ghost" size="sm" disabled={busy !== null} onClick={onClose}>
              Close
            </Button>
          </div>

          {confirming && (
            <p style={{ ...meta, color: 'var(--tone-attention)' }}>
              This puts money back on their card straight away. Press the button again to confirm.
            </p>
          )}

          <Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} label={`Email ${who} about it`} />
          <p style={meta}>
            {options.onlyLine
              ? 'Waiting holds the order until the item is back; the daily check sends it, or tells you, when it is.'
              : 'Sending later moves this item into its own order, held until it is back in stock — the rest can go now, and the second parcel’s postage is on us.'}{' '}
            Every email offers them a refund by reply.
          </p>
        </>
      )}
    </div>
  )
}
