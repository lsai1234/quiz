'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PriceRow } from '@/lib/catalogue/price'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { Badge, Button, Card, Input, Note } from '@/components/system'

interface Props {
  productId: string
  /** What the shop quotes for the product — the master SKU's price. */
  basePrice: number
  /** One row per SKU, priced three ways. Computed on the server; see `catalogue/price`. */
  rows: PriceRow[]
  /** The markup the rule is running at, so the panel can state the rule rather than assert it. */
  markupOnCost: number
}

const EYEBROW = {
  fontSize: 'var(--text-micro)',
  letterSpacing: 'var(--tracking-eyebrow)',
  color: 'var(--ink-3)',
  textTransform: 'uppercase',
} as const

const META = { fontSize: 'var(--text-micro)', color: 'var(--ink-3)' } as const

/**
 * What PowerBody charge us, what our rule makes of that, and what we charge.
 *
 * ── The number that had nowhere to be typed ─────────────────────────────────
 * Every shelf price in this shop is computed — supplier cost × the markup,
 * rounded down to .99 — and that rule is right for a catalogue of three
 * thousand products nobody can price by hand. It is not always right for the
 * one product a founder is looking at: a line everybody can price-check in ten
 * seconds, a loss leader, a cost that jumped between orders. There was no way
 * to say so. The cost was on screen (buried in a row of facts), the rule price
 * was nowhere, and a price typed into an override was undone by the next
 * supplier pull, because nothing recorded that a person had chosen it.
 *
 * So this panel puts the three prices beside each other — theirs, the rule's
 * and ours — and lets the last one be typed. A price set here is written as the
 * founder's (`priceSource`), which is what makes every later pull leave it
 * alone, and "Use the rule price" is the way back onto the policy.
 *
 * ── Per SKU, and the product follows its master ─────────────────────────────
 * A price belongs to a thing you can buy, and what you buy is a SKU. The
 * product's own price is the master's, so setting the master's price moves the
 * card and setting a flavour's does not — the same rule the rest of the screen
 * already runs on.
 *
 * ── Saved one at a time ─────────────────────────────────────────────────────
 * Not staged with the tree's names. A price is one decision about one SKU, it
 * takes effect in the shop the moment it lands, and a Save that quietly carried
 * four prices with a rename is not something anybody asked for.
 */
export function ProductPricing({ productId, basePrice, rows, markupOnCost }: Props) {
  const router = useRouter()
  /*
    What is in each box, keyed by SKU. Seeded once from the stored prices — a
    `useState` initialiser runs once — so a save that ends in `router.refresh()`
    leaves the boxes showing what was saved rather than resetting them under
    somebody who has already started typing the next one.
  */
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.variantId, r.price > 0 ? r.price.toFixed(2) : ''])),
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  /** The rule, in the words it actually runs by. */
  const rule = `${markupOnCost}× what PowerBody charge us, rounded down to .99`

  async function send(row: PriceRow, price: number | null) {
    setBusy(row.variantId)
    setError(null)
    setDone(null)
    try {
      const res = await fetch('/api/portal/products/price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, variantId: row.variantId, price }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? `Could not set that price (HTTP ${res.status}).`)
        return
      }
      const saved: PriceRow | undefined = (body.rows as PriceRow[] | undefined)?.find(
        (r) => r.variantId === row.variantId,
      )
      if (saved) setDraft((all) => ({ ...all, [row.variantId]: saved.price.toFixed(2) }))
      setDone(
        price === null
          ? `${row.label} is back on the rule at ${formatGBP(saved?.price ?? row.price)}.`
          : `${row.label} is ${formatGBP(saved?.price ?? price)} until you change it${row.isMaster ? ' — and so is the product' : ''}.`,
      )
      invalidateCatalogue()
      router.refresh()
    } catch {
      setError('Unable to reach the server.')
    } finally {
      setBusy(null)
    }
  }

  function save(row: PriceRow) {
    const typed = Number.parseFloat((draft[row.variantId] ?? '').trim())
    if (!Number.isFinite(typed) || typed <= 0) {
      setDone(null)
      setError(`Give ${row.label} a price above £0.`)
      return
    }
    void send(row, typed)
  }

  /*
    One SKU's prices. A function that is CALLED rather than a nested component,
    for the reason the tree gives: a component declared inside a render is a new
    type every time, and an input that remounts loses focus mid-price.
  */
  const priceRow = (row: PriceRow) => {
    const typed = (draft[row.variantId] ?? '').trim()
    const pending = typed !== '' && Number.parseFloat(typed) !== row.price
    return (
      <Card key={row.variantId} solid padding="tight" className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="min-w-0 truncate"
            style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}
          >
            {row.label}
          </span>
          {row.isMaster && <Badge tone="accent">Master SKU</Badge>}
          {row.manual && <Badge>Your price</Badge>}
          {row.belowCost && (
            <Badge tone="critical" dot>
              Below cost
            </Badge>
          )}
        </div>

        {/*
          What is known, said in full rather than abbreviated. These are three
          different kinds of number — a fact, a suggestion of theirs, and our own
          arithmetic — and a row of bare figures makes them look like one.
        */}
        <p style={{ ...META, overflowWrap: 'anywhere' }}>
          {row.cost != null
            ? `PowerBody charge us ${formatGBP(row.cost)}`
            : 'No supplier price on file'}
          {row.rrp != null ? ` · their RRP ${formatGBP(row.rrp)}` : ''}
          {row.rulePrice != null
            ? ` · the rule says ${formatGBP(row.rulePrice)}`
            : ' · so the rule cannot price it'}
          {row.wasPrice != null ? ` · the card shows “was ${formatGBP(row.wasPrice)}”` : ''}
        </p>

        <div className="flex items-end gap-2 flex-wrap">
          <Input
            label={`Our price for ${row.label}`}
            hideLabel
            compact
            align="right"
            className="w-28"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            prefix="£"
            value={draft[row.variantId] ?? ''}
            onChange={(e) => setDraft((all) => ({ ...all, [row.variantId]: e.target.value }))}
          />
          <Button
            size="sm"
            variant={pending ? 'primary' : 'secondary'}
            loading={busy === row.variantId}
            disabled={busy != null || !pending}
            aria-label={`Set our price for ${row.label}`}
            onClick={() => save(row)}
          >
            Set our price
          </Button>
          {/*
            Only where there is a rule price to go back to. Offering it on a SKU
            nobody knows the cost of would be a button that can only fail.
          */}
          {row.rulePrice != null && (row.manual || row.price !== row.rulePrice) && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy != null}
              aria-label={`Put ${row.label} back on the rule price of ${formatGBP(row.rulePrice)}`}
              onClick={() => void send(row, null)}
            >
              Use the rule price ({formatGBP(row.rulePrice)})
            </Button>
          )}
        </div>

        {row.belowCost && row.cost != null && (
          <p style={{ fontSize: 'var(--text-micro)', color: 'var(--tone-critical)' }}>
            {formatGBP(row.price)} does not cover the {formatGBP(row.cost)} we pay for it, before postage.
          </p>
        )}
      </Card>
    )
  }

  return (
    <Card elevation={2} className="space-y-3">
      <div>
        <p style={EYEBROW}>Price — what it costs us, and what we charge</p>
        <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)', marginTop: 'var(--space-1)' }}>
          The shop shows {formatGBP(basePrice)} for this product.
        </p>
        <p style={{ ...META, marginTop: 'var(--space-1)' }}>
          Every price here is worked out for us — {rule}. Type your own to override that for one SKU:
          a pull from PowerBody will keep reading their cost, and will leave the price you set alone.
        </p>
      </div>

      {rows.length === 0 ? (
        <Note tone="attention">This product has no SKUs, so there is nothing to price.</Note>
      ) : (
        <>
          {/*
            Nothing knows what any of this costs — which is two different
            situations, and the wrong one to be told about is the one where the
            answer is a button away.
          */}
          {rows.every((r) => r.cost == null) && (
            <Note tone="attention">
              {rows.some((r) => r.sku)
                ? 'Nothing has been pulled from PowerBody for this product yet, so there is no cost to price from. Press “Pull from PowerBody” above, or set the prices yourself here.'
                : 'No supplier code on this product, so there is nothing to ask PowerBody about. Its prices are whatever you set here.'}
            </Note>
          )}
          <div className="space-y-2">{rows.map(priceRow)}</div>
        </>
      )}

      {done && (
        <Note tone="positive" live="polite">
          {done}
        </Note>
      )}
      {error && (
        <Note tone="attention" live="polite">
          {error}
        </Note>
      )}
    </Card>
  )
}
