'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ProductReadiness, CheckStatus } from '@/lib/portal/readiness'
import type { ProductState } from '@/lib/portal/product-edit'
import { liveServings } from '@/lib/catalogue/servings'
import { productHref } from '@/lib/portal/product-links'
import { ProductStateBadge } from '@/components/portal/product/ProductStateBadge'
import { Badge, Button, Card, EmptyState, Input, Note } from '@/components/system'

/** Readiness status → the system's semantic tone. `Badge` owns the colours. */
const TONE: Record<CheckStatus, 'positive' | 'attention' | 'critical'> = { ok: 'positive', info: 'positive', warn: 'attention', fail: 'critical' }

/** What the roster API reports about a product's economics. */
type PriceAudit = {
  keeps: number
  marginPct: number
  viable: boolean
  costEstimated: boolean
  scenariosOk: boolean
  problems: string[]
}

interface Slot {
  rank: number
  productId: string
  product: CatalogueProduct | null
  readiness: ProductReadiness | null
  price: PriceAudit | null
}
interface Candidate {
  id: string
  title: string
  category: string
  basePrice: number
  cost: number | null
  subscriptionEligible: boolean
  readiness: CheckStatus
}
interface Payload { limit: number; roster: Slot[]; candidates: Candidate[] }

/** A roster id the shop no longer sells, and what became of it. */
type Gone = { title: string; state: ProductState } | 'gone'

const money = (n: number) => `£${n.toFixed(2)}`
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`

const META = { fontSize: 'var(--text-meta)', color: 'var(--ink-3)' } as const
const LINK = { color: 'var(--accent)', fontWeight: 'var(--weight-strong)' } as const

export default function TopProductsPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [gone, setGone] = useState<Record<string, Gone>>({})

  const load = useCallback(() => {
    setLoadError(null)
    fetch('/api/portal/top-products', { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 401) throw new Error('Your session has expired — sign in again to see the roster.')
        if (!r.ok) throw new Error(`The server answered with an error (HTTP ${r.status}).`)
        return r.json()
      })
      .then(setData)
      .catch((e: Error) => setLoadError(e.message || 'Could not reach the server — check the connection.'))
  }, [])
  useEffect(load, [load])

  /*
    What became of a roster product the shop no longer sells.

    The roster read only knows the products on sale, so a product that was
    removed — or is back waiting for review — came through as a bare id with
    "no longer in the catalogue". It usually IS still there, removed and
    restorable, and the founder's next question is "can I get it back?". So for
    those ids alone, the full product list says what each one is now, and the
    row links to its page, where Restore is.
  */
  // A string, not the array: every reload makes a new array, and the lookup
  // should run when the set of missing ids changes, not on every move.
  const missingKey = (data?.roster ?? []).filter((s) => !s.product).map((s) => s.productId).join('\n')
  useEffect(() => {
    const missing = missingKey ? missingKey.split('\n') : []
    if (missing.length === 0) return
    let cancelled = false
    fetch('/api/portal/products?all=1', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { products?: Array<{ product: CatalogueProduct; state: ProductState }> } | null) => {
        if (cancelled || !d?.products) return
        const byId = new Map(d.products.map((e) => [e.product.id, e]))
        setGone(
          Object.fromEntries(
            missing.map((id) => {
              const entry = byId.get(id)
              return [id, entry ? { title: entry.product.title, state: entry.state } : 'gone'] as const
            }),
          ),
        )
      })
      .catch(() => {
        /* the row still says it is not on sale, and Take it off still works */
      })
    return () => {
      cancelled = true
    }
  }, [missingKey])

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch('/api/portal/top-products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const d = await res.json().catch(() => ({}))
        if (res.status === 401) setError('Your session has expired — sign in again, then make the change again.')
        else if (!res.ok) setError(`${d.error ?? 'The change was not saved.'} The roster below is as it stands now.`)
      } catch {
        setError('Could not reach the server, so nothing changed. Check the connection and try again.')
      } finally {
        setBusy(false)
        load()
      }
    },
    [load],
  )

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = data?.candidates ?? []
    return q ? list.filter((c) => c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)) : list
  }, [data, query])

  if (!data) {
    return loadError ? (
      <EmptyState
        icon="alert-triangle"
        title="The roster could not be loaded"
        action={
          <Button variant="secondary" size="sm" icon="refresh" onClick={load}>
            Try again
          </Button>
        }
      >
        {loadError}
      </EmptyState>
    ) : (
      <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)' }}>Loading…</p>
    )
  }

  const full = data.roster.length >= data.limit
  const problems = data.roster.filter((s) => !s.product || s.readiness?.overall === 'fail').length
  const unprofitable = data.roster.filter((s) => s.price && !s.price.viable).length

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-5)', paddingBottom: 'var(--space-8)' }}>
      <div>
        <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-display)', color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
          Top {data.limit}
        </h2>
        <p style={{ fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
          The products the quiz reaches for first. Everything we sell is still in the shop and still swappable —
          this is what the engine prefers when several products could fill the same slot, ranked so #1 wins ties over #{data.limit}.
        </p>
        <p style={{ ...META, marginTop: 'var(--space-1)' }}>
          There are {data.limit} places on purpose: being here is a promise that this product&apos;s data is
          maintained, so the columns below are that promise, kept or broken. Open a product to fix what it says.
        </p>
      </div>

      <div className="grid grid-cols-3" style={{ gap: 'var(--space-3)' }}>
        <Stat n={`${data.roster.length}/${data.limit}`} label="Places filled" colour={full ? 'var(--tone-positive)' : 'var(--accent)'} />
        <Stat n={problems} label="Not ready to sell" colour={problems > 0 ? 'var(--tone-critical)' : 'var(--tone-positive)'} />
        <Stat n={unprofitable} label="Losing money" colour={unprofitable > 0 ? 'var(--tone-critical)' : 'var(--tone-positive)'} />
      </div>

      {error && (
        <Note tone="critical" icon="alert-triangle" live="assertive">
          {error}
        </Note>
      )}

      {/* The roster */}
      {data.roster.length === 0 ? (
        <EmptyState icon="star" title="Nothing on the roster yet">
          Until you pick some, the quiz scores the whole catalogue evenly. Add products from the list below.
        </EmptyState>
      ) : (
        <ol className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
          {data.roster.map((slot, i) => {
            const p = slot.product
            const verdict = slot.price
            const was = gone[slot.productId]
            const name = p?.title ?? (was && was !== 'gone' ? was.title : slot.productId)
            return (
              <Card as="li" key={slot.productId} solid padding="tight" tone={!p ? 'critical' : undefined}>
                <div className="flex items-start" style={{ gap: 'var(--space-3)' }}>
                  <span className="text-right shrink-0" style={{ minWidth: 'var(--space-6)', fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', color: 'var(--accent)' }}>
                    {slot.rank}
                  </span>

                  <div className="min-w-0 flex-1">
                    {p ? (
                      <>
                        <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
                          {/* Opens the product at its quiz settings — what
                              ranking on this roster is about. Everything else
                              about it is on the same page. */}
                          <Link
                            href={productHref(p.id, 'quiz')}
                            className="system-focus min-w-0"
                            style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)', borderRadius: 'var(--radius-chip)' }}
                          >
                            {p.title}
                          </Link>
                          {/* Only when it is not fine: a green dot on every row
                              says nothing about which one needs opening. */}
                          {slot.readiness && slot.readiness.overall !== 'ok' && (
                            <Badge tone={TONE[slot.readiness.overall]} dot>
                              {slot.readiness.overall === 'fail' ? 'Not ready' : 'Needs a look'}
                            </Badge>
                          )}
                        </div>
                        <p style={{ ...META, marginTop: 'var(--space-1)' }}>
                          {p.category} · {p.subscriptionEligible ? 'subscribable' : 'one-off'} · {liveServings(p)} servings ·{' '}
                          {money(p.basePrice)}{p.cost != null && p.cost > 0 ? ` · costs ${money(p.cost)}` : ' · cost unknown'}
                        </p>
                        {verdict && (
                          <p style={{ fontSize: 'var(--text-meta)', marginTop: 'var(--space-1)', color: !verdict.viable ? 'var(--tone-critical)' : !verdict.scenariosOk ? 'var(--tone-attention)' : 'var(--tone-positive)' }}>
                            {verdict.viable
                              ? `We keep ${money(verdict.keeps)} a month (${pct(verdict.marginPct)})`
                              : 'Loses money as a stack line'}
                            {!verdict.scenariosOk && verdict.problems.length > 0 && ` · loses on: ${verdict.problems.join(', ')}`}
                            {verdict.costEstimated && ' · cost estimated'}
                          </p>
                        )}
                        {slot.readiness && slot.readiness.overall !== 'ok' && (
                          <p style={{ fontSize: 'var(--text-meta)', marginTop: 'var(--space-1)', color: slot.readiness.overall === 'fail' ? 'var(--tone-critical)' : 'var(--tone-attention)' }}>
                            {/* `info` is never something to fix — it does not
                                belong in a list of what is broken. */}
                            {slot.readiness.checks.filter((c) => c.status === 'fail' || c.status === 'warn').map((c) => c.label).join(' · ')}
                          </p>
                        )}
                      </>
                    ) : (
                      <MissingProduct id={slot.productId} was={was} />
                    )}
                  </div>

                  {/* Named by what they move. Twenty-five rows of "Move up" is
                      a list a screen-reader user cannot work in. */}
                  <div className="flex items-center shrink-0" style={{ gap: 'var(--space-1)' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="chevron-up"
                      aria-label={`Move ${name} up`}
                      disabled={busy || i === 0}
                      onClick={() => act({ action: 'move', productId: slot.productId, direction: -1 })}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="chevron-down"
                      aria-label={`Move ${name} down`}
                      disabled={busy || i === data.roster.length - 1}
                      onClick={() => act({ action: 'move', productId: slot.productId, direction: 1 })}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="x"
                      aria-label={`Take ${name} off the roster`}
                      disabled={busy}
                      onClick={() => act({ action: 'remove', productId: slot.productId })}
                    />
                  </div>
                </div>
              </Card>
            )
          })}
        </ol>
      )}

      {/* Candidates */}
      <section>
        <h3 style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)', marginBottom: 'var(--space-1)' }}>
          Everything else ({data.candidates.length})
        </h3>
        <p style={{ ...META, marginBottom: 'var(--space-2)' }}>
          {full
            ? `The Top ${data.limit} is full — take something off before adding.`
            : `${data.limit - data.roster.length} place${data.limit - data.roster.length === 1 ? '' : 's'} left.`}
        </p>
        <div style={{ marginBottom: 'var(--space-2)' }}>
          <Input
            label="Search the catalogue"
            compact
            className="w-full"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the catalogue…"
          />
        </div>

        <ul className="flex flex-col overflow-y-auto" style={{ gap: 'var(--space-2)', maxHeight: '24rem' }}>
          {candidates.map((c) => (
            // `solid`: this list scrolls inside its own box, and translucency
            // over a scrolling parent is the case that is not paid for.
            <Card as="li" key={c.id} solid padding="tight" className="flex items-center justify-between">
              <div className="min-w-0 flex items-center" style={{ gap: 'var(--space-2)' }}>
                <div className="min-w-0">
                  <Link
                    href={productHref(c.id, 'quiz')}
                    className="system-focus block truncate"
                    style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)', borderRadius: 'var(--radius-chip)' }}
                  >
                    {c.title}
                  </Link>
                  <p style={META}>
                    {c.category} · {money(c.basePrice)}{!(c.cost != null && c.cost > 0) && ' · cost unknown'}
                  </p>
                </div>
                {c.readiness !== 'ok' && c.readiness !== 'info' && (
                  <Badge tone={TONE[c.readiness]} dot>
                    {c.readiness === 'fail' ? 'Not ready' : 'Needs a look'}
                  </Badge>
                )}
              </div>
              <Button
                size="sm"
                icon="plus"
                aria-label={`Add ${c.title} to the roster`}
                disabled={busy || full}
                onClick={() => act({ action: 'add', productId: c.id })}
              >
                Add
              </Button>
            </Card>
          ))}
          {candidates.length === 0 && (
            <li className="text-center" style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)', padding: 'var(--space-4) 0' }}>
              {query.trim() ? 'Nothing matches that search.' : 'Every product on sale is already on the roster.'}
            </li>
          )}
        </ul>
      </section>
    </div>
  )
}

/**
 * A roster place whose product the shop no longer sells — said as what
 * happened to it, with the way back where there is one.
 */
function MissingProduct({ id, was }: { id: string; was: Gone | undefined }) {
  const text = { fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' } as const
  if (was && was !== 'gone') {
    return (
      <>
        <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
          <Link href={productHref(id)} className="system-focus" style={{ ...text, fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', borderRadius: 'var(--radius-chip)' }}>
            {was.title}
          </Link>
          <ProductStateBadge state={was.state} />
        </div>
        <p style={{ ...META, marginTop: 'var(--space-1)' }}>
          {was.state === 'removed' ? (
            <>
              Removed from the shop, so the quiz skips this place.{' '}
              <Link href={productHref(id)} style={LINK}>Open it to restore it</Link>, or take it off the roster.
            </>
          ) : was.state === 'pending' ? (
            <>
              Waiting for review, so it is not on sale yet.{' '}
              <Link href={productHref(id, 'checks')} style={LINK}>Check and approve it</Link>, or take it off the roster.
            </>
          ) : (
            <>Not in the shop right now. Take it off the roster, or open it to see why.</>
          )}
        </p>
      </>
    )
  }
  return (
    <>
      <p style={{ ...text, fontWeight: 'var(--weight-strong)' }}>{id}</p>
      <p style={{ ...META, marginTop: 'var(--space-1)' }}>
        {was === 'gone'
          ? 'No longer exists — it was discarded or merged into another product. Take it off the roster.'
          : 'Not in the shop any more. Take it off the roster, or open it to see what happened to it.'}
        {was !== 'gone' && (
          <>
            {' '}
            <Link href={productHref(id)} style={LINK}>Open it</Link>
          </>
        )}
      </p>
    </>
  )
}

function Stat({ n, label, colour }: { n: number | string; label: string; colour: string }) {
  return (
    <Card elevation={2} className="text-center">
      <p style={{ fontSize: 'var(--text-display)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', color: colour }}>
        {n}
      </p>
      <p style={{ ...META, marginTop: 'var(--space-1)' }}>{label}</p>
    </Card>
  )
}
