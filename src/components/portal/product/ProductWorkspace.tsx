'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Badge, Button, Card, Note, buttonSurface } from '@/components/system'
import { ProductStateBadge } from './ProductStateBadge'
import { ProductPreview } from './ProductPreview'
import { ListingSection } from './ListingSection'
import { VariantsSection } from './VariantsSection'
import { QuizSection } from './QuizSection'
import { SupplierSection } from './SupplierSection'
import { EYEBROW, META, REVIEW_SECTION, errorText, postProduct, type Payload } from './shared'
import { productHref, productsHref, REVIEW_HREF, type ProductSection } from '@/lib/portal/product-links'
import { REVIEW_FIELDS } from '@/lib/catalogue/review'

/**
 * One product, every fact about it, in one place.
 *
 * This replaces three screens that each showed part of a product and edited it
 * their own way — the Catalogue's editor modal, the Dashboard's product page and
 * Review's product view — and that is why a founder could not tell where to
 * change what the shop shows. Here every field has exactly one home:
 *
 *   Shop listing      what a customer reads: name, picture, description, tags
 *   Flavours & sizes  every SKU: its name, size, servings, picture, price, master
 *   Quiz & subscription  who it is recommended to, and how a plan is sized
 *   Supplier          PowerBody's side: ids, cost, weight, VAT, and the pull
 *
 * Above them, what is wrong (Checks) and what the customer actually sees.
 *
 * The page keeps ONE copy of the product. Every save answers with the product
 * as it now stands and that replaces the copy — see `shared.tsx`.
 */
export function ProductWorkspace({ initial }: { initial: Payload }) {
  const router = useRouter()
  const search = useSearchParams()
  const queueMode = search.get('queue') === 'review'
  const [payload, setPayload] = useState<Payload>(initial)
  const [dirty, setDirty] = useState<Set<string>>(() => new Set())
  const product = payload.product

  // A new product (navigating between products in queue mode) starts clean.
  useEffect(() => {
    setPayload(initial)
    setDirty(new Set())
  }, [initial])

  const markDirty = useCallback((section: string, isDirty: boolean) => {
    setDirty((current) => {
      if (current.has(section) === isDirty) return current
      const next = new Set(current)
      if (isDirty) next.add(section)
      else next.delete(section)
      return next
    })
  }, [])

  // Leaving with typed-but-unsaved changes asks first. Several sections each
  // have their own Save, and a founder who edited two and saved one should not
  // lose the other to a misclick on the sub-nav.
  //
  // Two ways out, two guards. Closing the tab, reloading or going to another
  // site unloads the page, and the browser asks (`beforeunload`). A link INSIDE
  // the hub — the products sub-nav, "All products", the queue's "Skip for now"
  // and "Back to the queue" — does not unload anything: Next swaps the page in
  // place, `beforeunload` never fires, and the typed edits went with no word.
  // So while anything is unsaved, a click on a link to another page of this
  // site asks first. It listens on the document in the capture phase, ahead of
  // every link's own handler, and a "Cancel" marks the click handled
  // (`preventDefault`), which both the browser and Next's Link respect.
  useEffect(() => {
    if (dirty.size === 0) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    const ask = (e: MouseEvent) => {
      if (!leavesThePage(e)) return
      if (!window.confirm(leaveQuestion(dirty))) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('click', ask, true)
    return () => {
      window.removeEventListener('beforeunload', warn)
      document.removeEventListener('click', ask, true)
    }
  }, [dirty])

  const sectionProps = { payload, onPayload: setPayload, onDirty: markDirty }

  return (
    <div className="space-y-4" style={{ maxWidth: 'var(--modal-lg)' }}>
      {queueMode ? (
        <QueueStrip id={product.id} />
      ) : (
        <Link href={payload.state === 'pending' ? REVIEW_HREF : productsHref()} {...buttonSurface('ghost', 'sm')}>
          ← {payload.state === 'pending' ? 'Back to the review queue' : 'All products'}
        </Link>
      )}

      <Header payload={payload} onPayload={setPayload} queueMode={queueMode} onGone={(next) => router.push(next)} />
      <Checks payload={payload} onPayload={setPayload} />
      <ProductPreview payload={payload} />
      <ListingSection {...sectionProps} />
      <VariantsSection {...sectionProps} />
      <QuizSection {...sectionProps} />
      <SupplierSection {...sectionProps} />

      {dirty.size > 0 && (
        <Note tone="attention">
          Not saved yet: {[...dirty].join(', ')}. Each section has its own Save.
        </Note>
      )}
    </div>
  )
}

// ── Leaving with unsaved edits ──────────────────────────────────────────────

/** What a founder is asked before an in-app link takes them away from unsaved edits. */
function leaveQuestion(dirty: Set<string>): string {
  return `Not saved yet: ${[...dirty].join(', ')}. Leave this page and lose ${dirty.size === 1 ? 'that change' : 'those changes'}? Press Cancel to stay and save first.`
}

/**
 * Whether a click is about to take the browser to another page of this site
 * WITHOUT unloading this one — the case `beforeunload` cannot see.
 *
 * Left alone: a click something else already handled; one that opens a new tab
 * or window (modifier keys, middle button, `target="_blank"`) or downloads,
 * since this page stays open; a link to another site, which unloads the page
 * and so is asked about by the browser itself; and a link to a part of this
 * page (`#listing` from Checks), which goes nowhere.
 */
function leavesThePage(e: MouseEvent): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false
  const anchor = e.target instanceof Element ? e.target.closest('a[href]') : null
  if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute('download')) return false
  const target = anchor.getAttribute('target')
  if (target && target !== '_self') return false
  let url: URL
  try {
    url = new URL(anchor.href, window.location.href)
  } catch {
    return false
  }
  if (url.origin !== window.location.origin) return false
  return url.pathname !== window.location.pathname || url.search !== window.location.search
}

// ── The review queue, one product at a time ─────────────────────────────────

/**
 * "x of N · Skip · Back to the queue", when a product is opened from Review's
 * "one at a time". A hundred imports in a list feels unfinishable; one at a
 * time, with the count going down, gets done.
 */
function QueueStrip({ id }: { id: string }) {
  const [ids, setIds] = useState<string[] | null>(null)
  useEffect(() => {
    let live = true
    fetch('/api/portal/products/review')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && d) setIds((d.products ?? []).map((p: { product: { id: string } }) => p.product.id))
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [id])
  if (!ids) return <p style={META}>Loading the queue…</p>
  const at = ids.indexOf(id)
  const next = ids.find((x, i) => i > at && x !== id) ?? ids.find((x) => x !== id)
  return (
    <Card elevation={1} padding="tight" className="flex items-center justify-between flex-wrap gap-2">
      <span style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>
        {at >= 0 ? `${at + 1} of ${ids.length} waiting for review` : `${ids.length} waiting for review`}
      </span>
      <span className="flex items-center flex-wrap" style={{ gap: 'var(--space-2)' }}>
        {next && (
          <Link href={productHref(next, undefined, { queue: true })} {...buttonSurface('secondary', 'sm')}>
            Skip for now
          </Link>
        )}
        <Link href={REVIEW_HREF} {...buttonSurface('ghost', 'sm')}>
          Back to the queue
        </Link>
      </span>
    </Card>
  )
}

/** Where to go once this product has left the queue (approved or discarded). */
async function nextInQueue(after: string): Promise<string> {
  try {
    const d = await fetch('/api/portal/products/review').then((r) => r.json())
    const ids: string[] = (d.products ?? []).map((p: { product: { id: string } }) => p.product.id).filter((x: string) => x !== after)
    return ids.length > 0 ? productHref(ids[0], undefined, { queue: true }) : REVIEW_HREF
  } catch {
    return REVIEW_HREF
  }
}

// ── Header ───────────────────────────────────────────────────────────────────

function Header({
  payload,
  onPayload,
  queueMode,
  onGone,
}: {
  payload: Payload
  onPayload: (p: Payload) => void
  queueMode: boolean
  onGone: (href: string) => void
}) {
  const { product, state } = payload
  const [confirming, setConfirming] = useState<'remove' | 'discard' | 'undo-merge' | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<{ label: string; href: string } | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function act(action: 'approve' | 'remove' | 'restore' | 'discard' | 'undo-merge') {
    setBusy(action)
    setError(null)
    setLink(null)
    setDone(null)
    const result = await postProduct('/api/portal/products', { id: product.id, action })
    setBusy(null)
    setConfirming(null)
    if (!result.ok) {
      setError(errorText(result))
      setLink(result.link ?? null)
      return
    }
    if (action === 'discard') {
      onGone(queueMode ? await nextInQueue(product.id) : REVIEW_HREF)
      return
    }
    if (action === 'approve' && queueMode) {
      onGone(await nextInQueue(product.id))
      return
    }
    onPayload(result.payload)
    setDone(
      action === 'approve'
        ? 'Approved — it is on sale in the shop and the quiz can recommend it.'
        : action === 'remove'
          ? 'Removed from the shop, the quiz and every list. Restore brings it back exactly as it was.'
          : action === 'undo-merge'
            ? `Back on sale on its own, as it was before the merge. Its SKUs have left “${payload.heldBy?.title ?? 'the other product'}”.`
            : 'Restored — it is on sale again.',
    )
  }

  const left = payload.remaining.length
  const supplierId = product.supplierProductId

  return (
    <Card elevation={2} className="space-y-3">
      <div className="flex" style={{ gap: 'var(--space-3)' }}>
        <div
          className="flex-shrink-0 overflow-hidden flex items-center justify-center"
          style={{ width: 'var(--control-lg)', height: 'var(--control-lg)', borderRadius: 'var(--radius-chip)', background: 'var(--surface-2)', border: '1px solid var(--edge)' }}
        >
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span style={META}>No picture</span>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)', overflowWrap: 'anywhere' }}>
            {product.title}
          </h1>
          <div className="flex items-center flex-wrap" style={{ gap: 'var(--space-2)' }}>
            <ProductStateBadge state={state} />
            {product.topRank != null && <Badge tone="accent">Top 25 · #{product.topRank}</Badge>}
            {payload.source === 'mock' && <Badge tone="info">Sample catalogue</Badge>}
          </div>
          <p style={META}>
            {[product.brand, product.category].filter(Boolean).join(' · ')}
            {supplierId ? ` · PowerBody product ${supplierId}` : ''} · /product/{product.handle}
          </p>
        </div>
      </div>

      <div className="flex items-center flex-wrap" style={{ gap: 'var(--space-2)' }}>
        {state === 'pending' && (
          <>
            <Button variant="primary" size="sm" loading={busy === 'approve'} disabled={left > 0 || busy !== null} onClick={() => void act('approve')}>
              {left > 0 ? `Approve — ${left} field${left === 1 ? '' : 's'} still to check` : 'Approve and put on sale'}
            </Button>
            {confirming === 'discard' ? (
              <>
                <Button variant="destructive" size="sm" loading={busy === 'discard'} onClick={() => void act('discard')}>
                  Confirm — discard it
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                  Keep it
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirming('discard')}>
                Discard
              </Button>
            )}
          </>
        )}
        {state === 'live' && (
          <>
            <a href={`/product/${product.handle}`} target="_blank" rel="noreferrer" {...buttonSurface('secondary', 'sm')}>
              View in shop
            </a>
            {confirming === 'remove' ? (
              <>
                <Button variant="destructive" size="sm" loading={busy === 'remove'} onClick={() => void act('remove')}>
                  Confirm — remove it
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                  Keep it
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirming('remove')}>
                Remove from sale
              </Button>
            )}
          </>
        )}
        {state === 'removed' && !payload.heldBy && (
          <Button variant="primary" size="sm" loading={busy === 'restore'} onClick={() => void act('restore')}>
            Restore — put it back on sale
          </Button>
        )}
        {state === 'removed' && payload.heldBy?.merged && (
          confirming === 'undo-merge' ? (
            <>
              <Button variant="primary" size="sm" loading={busy === 'undo-merge'} onClick={() => void act('undo-merge')}>
                Confirm — undo the merge
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                Leave it merged
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm" onClick={() => setConfirming('undo-merge')}>
              Undo the merge
            </Button>
          )
        )}
      </div>

      {/*
        A removed product whose SKUs are sold by another can't just be restored —
        the same tub would be listed twice. Say where they went, and offer the
        way back when it was a merge.
      */}
      {state === 'removed' && payload.heldBy && (
        <p style={META}>
          {payload.heldBy.merged ? 'Merged into ' : 'Its SKUs are sold as '}
          <Link href={productHref(payload.heldBy.id)} style={{ textDecoration: 'underline' }}>
            {payload.heldBy.title}
          </Link>
          {payload.heldBy.merged
            ? ' — its flavours are listed there now.'
            : ' now, so it cannot be restored without listing them twice.'}
        </p>
      )}
      {confirming === 'undo-merge' && payload.heldBy && (
        <p style={META}>
          Its SKUs leave “{payload.heldBy.title}” and this product goes back on sale as it was before the merge. Anything
          changed on those SKUs while they were part of “{payload.heldBy.title}” stays behind.
        </p>
      )}

      {confirming === 'remove' && (
        <p style={META}>
          It disappears from the shop, the quiz and every list at once. Nothing is deleted — Restore brings it back.
          {payload.usageWarning ? ` ${payload.usageWarning}` : ''}
        </p>
      )}
      {confirming === 'discard' && (
        <p style={META}>
          Discarding deletes this import outright. Adding the same SKU again later starts fresh.
        </p>
      )}
      {state === 'pending' && left > 0 && (
        <p style={META}>Waiting for review: nothing here is in the shop or the quiz until it is approved. Checks below lists what is left.</p>
      )}
      {done && <Note tone="positive" live="polite">{done}</Note>}
      {error && (
        <Note tone="attention" live="polite">
          {error}{' '}
          {link && (
            <Link href={link.href} style={{ textDecoration: 'underline' }}>
              {link.label}
            </Link>
          )}
        </Note>
      )}
    </Card>
  )
}

// ── Checks ───────────────────────────────────────────────────────────────────

const SECTION_NAME: Record<ProductSection, string> = {
  checks: 'Checks',
  preview: 'What the customer sees',
  listing: 'Shop listing',
  variants: 'Flavours, sizes & prices',
  quiz: 'Quiz & subscription',
  supplier: 'Supplier',
}

/**
 * Everything that needs a decision, each with a link to the section that fixes
 * it — readiness (would this sell properly?) and, for a product waiting for
 * review, the fields a rule or a model filled in that a person must check.
 */
function Checks({ payload, onPayload }: { payload: Payload; onPayload: (p: Payload) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const problems = payload.readiness.checks.filter((c) => c.status === 'fail' || c.status === 'warn')
  const notes = payload.readiness.checks.filter((c) => c.status === 'info')

  const outstanding = useMemo(() => {
    const groups = new Map<ProductSection, Array<{ key: string; label: string; note?: string }>>()
    for (const key of payload.remaining) {
      const field = REVIEW_FIELDS.find((f) => f.key === key)
      const section = REVIEW_SECTION[key] ?? 'listing'
      groups.set(section, [...(groups.get(section) ?? []), { key, label: field?.label ?? key, note: field?.note }])
    }
    return [...groups.entries()]
  }, [payload.remaining])

  async function confirm(keys: string[]) {
    setBusy(keys.join(','))
    setError(null)
    const result = await postProduct('/api/portal/products', { id: payload.product.id, confirm: keys })
    setBusy(null)
    if (result.ok) onPayload(result.payload)
    else setError(errorText(result))
  }

  if (problems.length === 0 && outstanding.length === 0 && notes.length === 0) {
    return (
      <div id="checks">
        <Card elevation={1} padding="tight">
          <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--tone-positive)' }}>Every check passes.</p>
        </Card>
      </div>
    )
  }

  return (
    <div id="checks">
    <Card elevation={1} className="space-y-3" tone={problems.some((p) => p.status === 'fail') ? 'attention' : undefined}>
      <p style={EYEBROW}>Checks</p>

      {outstanding.length > 0 && (
        <div className="space-y-2">
          <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>
            {payload.remaining.length} field{payload.remaining.length === 1 ? '' : 's'} a rule or a model filled in — check each, then approve.
          </p>
          {outstanding.map(([section, fields]) => (
            <div key={section} className="space-y-1">
              <div className="flex items-center justify-between flex-wrap" style={{ gap: 'var(--space-2)' }}>
                <a href={`#${section}`} style={{ ...META, textDecoration: 'underline' }}>
                  {SECTION_NAME[section]}
                </a>
                {fields.length > 1 && (
                  <Button size="sm" variant="ghost" loading={busy === fields.map((f) => f.key).join(',')} onClick={() => void confirm(fields.map((f) => f.key))}>
                    All {fields.length} look right
                  </Button>
                )}
              </div>
              <ul className="space-y-1" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {fields.map((f) => (
                  <li key={f.key} className="flex items-center justify-between flex-wrap" style={{ gap: 'var(--space-2)' }}>
                    <span style={BODY_SM}>
                      {f.label}
                      {f.note ? <span style={META}> — {f.note}</span> : null}
                    </span>
                    <Button size="sm" variant="ghost" loading={busy === f.key} onClick={() => void confirm([f.key])}>
                      Looks right
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {problems.length > 0 && (
        <ul className="space-y-1" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {problems.map((c) => (
            <li key={c.id} style={BODY_SM}>
              <Badge tone={c.status === 'fail' ? 'critical' : 'attention'}>{c.status === 'fail' ? 'Blocking' : 'Warning'}</Badge>{' '}
              {c.label}
              {c.detail ? <span style={META}> — {c.detail}</span> : null}{' '}
              {c.section && (
                <a href={`#${c.section}`} style={{ ...META, textDecoration: 'underline' }}>
                  Fix in {SECTION_NAME[c.section]}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {notes.length > 0 && (
        <ul className="space-y-1" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {notes.map((c) => (
            <li key={c.id} style={META}>
              {c.label}: {c.detail}
            </li>
          ))}
        </ul>
      )}
      {error && <Note tone="attention" live="polite">{error}</Note>}
    </Card>
    </div>
  )
}

const BODY_SM = { fontSize: 'var(--text-body-sm)', color: 'var(--ink-2)' } as const
