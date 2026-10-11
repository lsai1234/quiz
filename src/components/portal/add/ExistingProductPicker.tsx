'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, Input, Note, OptionRow, Skeleton } from '@/components/system'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { Row, Stack, metaText } from './ui'
import { plural } from './lookup'

interface Entry {
  product: CatalogueProduct
  state: 'live' | 'pending' | 'removed'
}

const STATE_WORDS: Record<Entry['state'], string> = {
  live: 'on sale',
  pending: 'waiting for review',
  removed: 'removed',
}

/** Title, brand, category and every SKU and flavour — how a founder knows a product. */
function matches(entry: Entry, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const p = entry.product
  const hay = [p.title, p.brand, p.category, ...p.variants.flatMap((v) => [v.title, v.flavour, v.size, v.sku])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return words.every((w) => hay.includes(w))
}

/**
 * Pick the product new flavours join.
 *
 * Every product a founder could mean — on sale or still waiting for review —
 * but not removed ones: flavours added to a hidden product would vanish with
 * it. Searchable, because the catalogue is hundreds long and the founder knows
 * the product by name or by one of its SKUs, not by where it sits in a list.
 */
export function ExistingProductPicker({
  count,
  busy,
  onPick,
  onCancel,
}: {
  /** How many flavours are about to join, for the confirm button. */
  count: number
  busy: boolean
  onPick: (target: { id: string; title: string; state: 'live' | 'pending' }) => void
  onCancel: () => void
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setError(null)
    fetch('/api/portal/products?all=1', { cache: 'no-store' })
      .then(async (res) => {
        const d = await res.json().catch(() => ({}))
        if (!active) return
        if (!res.ok) {
          setError(d.error ?? `The product list did not load (the server answered ${res.status}).`)
          return
        }
        setEntries(((d.products ?? []) as Entry[]).filter((e) => e.state !== 'removed'))
      })
      .catch(() => active && setError('The product list did not load — the server could not be reached.'))
    return () => {
      active = false
    }
  }, [attempt])

  const shown = useMemo(() => (entries ?? []).filter((e) => matches(e, query)).slice(0, 8), [entries, query])
  const picked = entries?.find((e) => e.product.id === chosen) ?? null

  if (error) {
    return (
      <Note tone="critical" live="polite">
        {error}{' '}
        <Button size="sm" variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </Button>
      </Note>
    )
  }

  return (
    <Stack gap="var(--space-2)">
      <Input
        label="Which product do these join?"
        placeholder="Search by name, brand, flavour or SKU"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {entries === null ? (
        <Stack gap="var(--space-2)">
          <Skeleton height="var(--control-md)" />
          <Skeleton height="var(--control-md)" />
        </Stack>
      ) : shown.length === 0 ? (
        <p style={metaText}>
          {entries.length === 0
            ? 'There are no products to add flavours to yet — add these as their own product instead.'
            : `Nothing matches “${query}”. Try the brand, or one of its SKUs.`}
        </p>
      ) : (
        <div role="radiogroup" aria-label="Products" className="flex flex-col" style={{ gap: 'var(--space-1)' }}>
          {shown.map((e) => (
            <OptionRow
              key={e.product.id}
              role="radio"
              selected={chosen === e.product.id}
              onClick={() => setChosen(e.product.id)}
              label={e.product.title}
              sub={[e.product.brand, plural(e.product.variants.length, 'flavour or size', 'flavours and sizes'), STATE_WORDS[e.state]]
                .filter(Boolean)
                .join(' · ')}
            />
          ))}
        </div>
      )}
      {/* Said before the press, not after: a flavour joining a product on sale
          is on sale the moment it lands, with no review in between. */}
      {picked?.state === 'live' && (
        <Note tone="attention">
          {picked.product.title} is on sale, so these flavours go on sale as soon as they are added. Check their names
          and prices on its page straight afterwards.
        </Note>
      )}
      <Row>
        <Button
          size="sm"
          variant="primary"
          disabled={!picked}
          loading={busy}
          onClick={() =>
            picked && onPick({ id: picked.product.id, title: picked.product.title, state: picked.state === 'live' ? 'live' : 'pending' })
          }
        >
          {picked ? `Add ${plural(count, 'flavour')} to ${picked.product.title}` : 'Pick a product'}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </Row>
    </Stack>
  )
}
