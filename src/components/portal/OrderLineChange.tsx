'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Checkbox, Input, Note, Select } from '@/components/system'

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

/** A product found by searching the whole catalogue — see `searchReplacements`. */
interface Pick {
  productId: string
  title: string
  brand: string | null
  category: string
  variants: { variantId: string; sku: string; label: string | null; price: number; difference: number; stock: number | null }[]
  warnings: string[]
}

interface Options {
  value: number
  live: { stock: number; inStock: boolean } | null
  replacements: Replacement[]
  onlyLine: boolean
}

const gbp = (n: number) => `£${n.toFixed(2)}`

const meta = { fontSize: 'var(--text-meta)', color: 'var(--ink-3)', lineHeight: 'var(--leading-snug)' } as const

function differenceLabel(r: { difference: number }, refundGap = true): string {
  if (Math.abs(r.difference) < 0.005) return 'same price'
  if (r.difference < 0) return `${gbp(-r.difference)} cheaper — ${refundGap ? 'we refund the gap' : 'no refund'}`
  return `${gbp(r.difference)} dearer — on us`
}

/** The swap button, with the money on it — the amount is what is being agreed to. */
function swapLabel(confirming: boolean, refund: number, warned: boolean): string {
  const money = refund > 0 ? ` — refund ${gbp(refund)}` : ''
  if (!confirming) return `Swap${money}`
  return warned ? `Swap anyway${money}` : `Confirm${money}`
}

const refundNote = (amount: number) => `This puts ${gbp(amount)} back on their card straight away. Press again to confirm.`

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
  /** What pressing again will do, said next to the button that will do it. */
  const [confirmText, setConfirmText] = useState<string | null>(null)
  const [notify, setNotify] = useState(true)
  /** Give back the gap when a swap costs less. Off: update the order, move no money. */
  const [refundGap, setRefundGap] = useState(true)

  // Picking any product by hand, not only the like-for-like suggestions.
  const [query, setQuery] = useState('')
  const [picks, setPicks] = useState<Pick[] | null>(null)
  const [searching, setSearching] = useState(false)
  /** The variant chosen for each found product, by product id. */
  const [chosen, setChosen] = useState<Record<string, string>>({})

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

  // Search as they type, once they pause. Each answer replaces the last; one
  // that arrives after a newer query is dropped.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setPicks(null)
      return
    }
    let current = true
    const timer = setTimeout(() => {
      setSearching(true)
      post({ action: 'line-search', query: q })
        .then((d) => current && setPicks(d.products as Pick[]))
        .catch((err: Error) => current && setError(err.message))
        .finally(() => current && setSearching(false))
    }, 300)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query, post])

  /** `confirm`: the sentence that asks for a second press, or null for none. */
  async function act(key: string, body: Record<string, unknown>, confirm: string | null) {
    if (confirm && confirming !== key) {
      setConfirming(key)
      setConfirmText(confirm)
      return
    }
    setBusy(key)
    setError(null)
    try {
      const d = await post({ ...body, notify, ...(body.action === 'line-swap' ? { refundDifference: refundGap } : {}) })
      onChanged(d.order)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.')
    } finally {
      setBusy(null)
      setConfirming(null)
      setConfirmText(null)
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
                const refund = refundGap && r.difference < -0.005 ? -r.difference : 0
                return (
                  <div key={r.variantId} className="flex items-center justify-between flex-wrap" style={{ gap: 'var(--space-2)' }}>
                    <div className="min-w-0">
                      <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)', overflowWrap: 'anywhere' }}>
                        {r.title}
                        {r.variantTitle ? ` · ${r.variantTitle}` : ''}
                      </p>
                      <p style={meta}>
                        {gbp(r.price)} · {differenceLabel(r, refundGap)}
                        {r.stock != null ? ` · ${r.stock} in stock${r.confirmed ? '' : ' (catalogue)'}` : ''}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      loading={busy === key}
                      disabled={busy !== null}
                      onClick={() =>
                        void act(
                          key,
                          { action: 'line-swap', productId: r.productId, variantId: r.variantId },
                          refund > 0 ? refundNote(refund) : null,
                        )
                      }
                    >
                      {swapLabel(confirming === key, refund, false)}
                    </Button>
                  </div>
                )
              })
            )}
          </div>

          <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
            <Input
              label="Or pick any product"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, brand, flavour or code"
              hint="Searches everything in stock in the catalogue. Anything that drops what the original promised is flagged."
              compact
            />
            {searching && <p style={meta}>Searching…</p>}
            {picks && picks.length === 0 && !searching && <p style={meta}>Nothing in stock matches that.</p>}
            {picks?.map((p) => {
              const variant = p.variants.find((v) => v.variantId === chosen[p.productId]) ?? p.variants[0]
              const key = `pick:${variant.variantId}`
              const refund = refundGap && variant.difference < -0.005 ? -variant.difference : 0
              const warned = p.warnings.length > 0
              const confirm = warned
                ? `${p.title} does not keep everything the original promised (above). Press again to send it anyway${refund > 0 ? ` and refund ${gbp(refund)}` : ''}.`
                : refund > 0
                  ? refundNote(refund)
                  : null
              return (
                <div key={p.productId} className="flex flex-col" style={{ gap: 'var(--space-2)', paddingTop: 'var(--space-2)' }}>
                  <div className="flex items-center justify-between flex-wrap" style={{ gap: 'var(--space-2)' }}>
                    <div className="min-w-0">
                      <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)', overflowWrap: 'anywhere' }}>
                        {p.brand ? `${p.brand} · ` : ''}
                        {p.title}
                      </p>
                      <p style={meta}>
                        {p.category} · {gbp(variant.price)} · {differenceLabel(variant, refundGap)}
                        {variant.stock != null ? ` · ${variant.stock} in stock` : ''} · {variant.sku}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      loading={busy === key}
                      disabled={busy !== null}
                      onClick={() =>
                        void act(
                          key,
                          { action: 'line-swap', productId: p.productId, variantId: variant.variantId, acceptWarnings: warned },
                          confirm,
                        )
                      }
                    >
                      {swapLabel(confirming === key, refund, warned)}
                    </Button>
                  </div>
                  {p.variants.length > 1 && (
                    <Select
                      label={`Which ${p.title}`}
                      hideLabel
                      compact
                      value={variant.variantId}
                      onChange={(e) => setChosen((c) => ({ ...c, [p.productId]: e.target.value }))}
                    >
                      {p.variants.map((v) => (
                        <option key={v.variantId} value={v.variantId}>
                          {(v.label ?? v.sku) + ` — ${gbp(v.price)}`}
                        </option>
                      ))}
                    </Select>
                  )}
                  {warned && (
                    <Note tone="attention" icon="alert-triangle">
                      {p.warnings.join('. ')}.
                    </Note>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
            <Button
              size="sm"
              loading={busy === 'backorder'}
              disabled={busy !== null}
              onClick={() => void act('backorder', { action: 'line-backorder' }, null)}
            >
              {options.onlyLine ? 'Wait for it to come back' : 'Send the rest now, this later'}
            </Button>
            {!options.onlyLine && (
              <Button
                variant="destructive"
                size="sm"
                loading={busy === 'remove'}
                disabled={busy !== null}
                onClick={() => void act('remove', { action: 'line-remove' }, refundNote(options.value))}
              >
                {confirming === 'remove' ? `Confirm — refund ${gbp(options.value)}` : `Remove and refund ${gbp(options.value)}`}
              </Button>
            )}
            <Button variant="ghost" size="sm" disabled={busy !== null} onClick={onClose}>
              Close
            </Button>
          </div>

          {confirming && confirmText && <p style={{ ...meta, color: 'var(--tone-attention)' }}>{confirmText}</p>}

          <Checkbox
            checked={refundGap}
            onChange={(e) => setRefundGap(e.target.checked)}
            label="Refund the difference when a swap costs less"
          />
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
