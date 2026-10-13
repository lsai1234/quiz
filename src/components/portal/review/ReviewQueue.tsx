'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button, Card, Checkbox, EmptyState, Input, Note, Skeleton, buttonSurface } from '@/components/system'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { ADD_PRODUCTS_HREF, REVIEW_HREF, productHref } from '@/lib/portal/product-links'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { QueueRow } from './QueueRow'
import { PullAll } from './PullAll'
import { fieldLabels, plural, type QueueEntry } from './queue-model'

type Load =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; entries: QueueEntry[] }

interface Notice {
  tone: 'positive' | 'attention' | 'critical' | 'info'
  text: string
  /** A way on from here — the product just made, the one still to fix. */
  links?: Array<{ href: string; label: string }>
  /**
   * One line per product the action could not do, each with its own link —
   * except one that is no longer there to open.
   */
  details?: Array<{ href?: string; title: string; text: string }>
}

const LINK = { color: 'var(--accent)', fontWeight: 'var(--weight-strong)', textDecoration: 'underline', textUnderlineOffset: '0.2em' } as const
const META = { fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)' } as const

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown>
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: 'Could not reach the server — check the connection and try again.' } }
  }
}

const errorOf = (r: { status: number; data: Record<string, unknown> }) =>
  typeof r.data.error === 'string' ? r.data.error : `The server answered with an error (HTTP ${r.status}).`

/**
 * The review queue — products added from PowerBody, held out of the shop and
 * the quiz until somebody has checked what a rule or a model decided for them.
 *
 * ── The queue, not the review ───────────────────────────────────────────────
 * This page used to be both: the list, and a field-by-field editor that opened
 * in place of it. That editor was a second way to change a product, with its
 * own idea of what saving meant, sitting beside the product page that changes
 * everything else. Now each product is reviewed on its own page — the same page
 * it will have once it is on sale — and this is only the queue: what is waiting,
 * what is left on each, and the things that are about several at once.
 *
 *   Review all, one at a time   opens the first in queue mode; the product page
 *                               shows "3 of 12 · Skip · Back to the queue", and
 *                               approving or discarding moves to the next
 *   Fill all from PowerBody     the bulk pull, paced and stoppable
 *   Combine as flavours         several imported flavours become one product
 *   Discard                     two presses, because it cannot be undone
 *   Approve the fully checked   everything already ticked off, in one go
 *
 * Working through a hundred products is not choosing what to click next — the
 * choosing IS the work, and it is what makes a queue of a hundred feel
 * unfinishable. So "one at a time" is the primary action, and the rest are for
 * the cases where one at a time is the slow way.
 */
export function ReviewQueue() {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState<'combine' | 'discard' | 'approve' | null>(null)
  /** How many a pending "discard" press would remove — the confirm step. */
  const [confirmDiscard, setConfirmDiscard] = useState<number | null>(null)
  const [combining, setCombining] = useState(false)
  const [combineTitle, setCombineTitle] = useState('')
  /** The bulk fill is writing to these products; nothing else should while it does. */
  const [pulling, setPulling] = useState(false)
  const [fillingId, setFillingId] = useState<string | null>(null)

  const fetchQueue = useCallback(async (quiet = false) => {
    if (!quiet) setLoad({ status: 'loading' })
    try {
      const res = await fetch('/api/portal/products/review', { cache: 'no-store' })
      if (res.status === 401) return setLoad({ status: 'signed-out' })
      const data = (await res.json().catch(() => null)) as { products?: QueueEntry[]; error?: string } | null
      if (!res.ok || !data || !Array.isArray(data.products)) {
        return setLoad({ status: 'failed', message: data?.error ?? `The server answered with an error (HTTP ${res.status}).` })
      }
      const entries = data.products
      setLoad({ status: 'ready', entries })
      // A product approved or discarded on its own page is no longer here.
      setPicked((prev) => new Set([...prev].filter((id) => entries.some((e) => e.product.id === id))))
    } catch {
      setLoad({ status: 'failed', message: 'Could not reach the server — check the connection.' })
    }
  }, [])

  useEffect(() => {
    void fetchQueue()
  }, [fetchQueue])

  const entries = useMemo(() => (load.status === 'ready' ? load.entries : []), [load])
  const titleOf = useCallback((id: string) => entries.find((e) => e.product.id === id)?.product.title ?? id, [entries])

  const pickedEntries = entries.filter((e) => picked.has(e.product.id))
  const readyAll = entries.filter((e) => e.complete)
  const readyPicked = pickedEntries.filter((e) => e.complete)
  const allPicked = entries.length > 0 && picked.size === entries.length
  const locked = busy !== null || pulling

  function toggle(id: string) {
    setConfirmDiscard(null)
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setPicked(new Set())
    setConfirmDiscard(null)
    setCombining(false)
  }

  /**
   * Fold the ticked products into one, a flavour each.
   *
   * PowerBody have no idea of a flavour — every flavour is its own SKU with its
   * own name — so without this a four-flavour tub is four products in the shop
   * and a customer is offered the same thing four times. Refused, with the
   * reason, when they are not flavours of one thing (different sizes are not
   * flavours: one price, one serving count, one picture would all be wrong).
   */
  async function combine() {
    const ids = [...picked]
    if (ids.length < 2) return
    setBusy('combine')
    setNotice(null)
    const r = await post('/api/portal/products/review', { action: 'combine', ids, ...(combineTitle.trim() ? { title: combineTitle.trim() } : {}) })
    setBusy(null)
    if (!r.ok) {
      setNotice({
        tone: 'critical',
        text:
          `Not combined — ${errorOf(r)}` +
          (r.status === 400 ? ' Untick the ones that are not flavours of the same thing, and combine the rest.' : ''),
      })
      return
    }
    const id = String(r.data.id ?? '')
    const variants = Number(r.data.variants ?? ids.length)
    clearSelection()
    setCombineTitle('')
    setNotice({
      tone: 'positive',
      text: `Combined ${ids.length} into one product with ${plural(variants, 'flavour or size', 'flavours or sizes')}. It is still waiting for review — check the flavour names on it, then approve it.`,
      links: id ? [{ href: productHref(id, 'variants', { queue: true }), label: 'Open the combined product' }] : [],
    })
    void fetchQueue(true)
  }

  /**
   * Discard everything ticked. Two presses on purpose: a discarded import
   * leaves no trace — there is nothing to restore it from — and a morning's
   * curation should not be one mis-tap from gone.
   */
  async function discard() {
    const ids = [...picked]
    if (ids.length === 0) return
    if (confirmDiscard !== ids.length) {
      setConfirmDiscard(ids.length)
      return
    }
    setBusy('discard')
    setNotice(null)
    const r = await post('/api/portal/products/review', { action: 'discard', ids })
    setBusy(null)
    setConfirmDiscard(null)
    if (!r.ok) {
      setNotice({ tone: 'critical', text: `Nothing was discarded — ${errorOf(r)} Try again in a moment.` })
      return
    }
    clearSelection()
    setNotice({ tone: 'positive', text: `${plural(ids.length, 'product')} discarded. Nothing was published — they were never on sale.` })
    void fetchQueue(true)
  }

  /**
   * Approve, in one press, everything already fully checked. The server
   * decides on each as it stands at that moment, and says which it would not
   * approve and what is still unchecked on them — each with a link to finish it.
   */
  async function approveReady() {
    // Ticked: exactly those, so the ones not ready are reported. Nothing
    // ticked: only the ones that look ready — a list of ninety "not ready yet"
    // nobody asked about is noise.
    const scope = picked.size > 0 ? pickedEntries : readyAll
    if (scope.length === 0) return
    setBusy('approve')
    setNotice(null)
    const r = await post('/api/portal/products', { action: 'approve-ready', ids: scope.map((e) => e.product.id) })
    setBusy(null)
    if (!r.ok) {
      setNotice({ tone: 'critical', text: `Nothing was approved — ${errorOf(r)}`, links: [{ href: REVIEW_HREF, label: 'Reload the queue' }] })
      return
    }
    /*
      Exactly what happened to each one, from the server's own lists — never
      inferred from what was asked. Approving is one write per product, so a
      batch can stop part-way: what was approved before that is on sale, and
      the notice says so first, then each one that was not and why.
    */
    const approved = Array.isArray(r.data.approved) ? (r.data.approved as string[]) : []
    const notReady = Array.isArray(r.data.notReady) ? (r.data.notReady as Array<{ id: string; remaining: string[] }>) : []
    const gone = Array.isArray(r.data.gone) ? (r.data.gone as string[]) : []
    const failed =
      r.data.failed && typeof r.data.failed === 'object'
        ? (r.data.failed as { id: string; error: string; notTried?: string[] })
        : null
    // On sale from this moment: the shop and the quiz re-read.
    if (approved.length > 0) invalidateCatalogue()
    const details = [
      ...notReady.map((n) => ({
        href: productHref(n.id, 'checks', { queue: true }),
        title: titleOf(n.id),
        text: `not approved — ${plural(n.remaining.length, 'field')} still to check: ${fieldLabels(n.remaining).join(', ')}.`,
      })),
      ...gone.map((id) => ({
        title: titleOf(id),
        text: 'not approved — it is no longer in the store. It was discarded or merged into another product, perhaps in another tab.',
      })),
      ...(failed
        ? [failed.id, ...(failed.notTried ?? [])].map((id, i) => ({
            href: productHref(id, 'checks', { queue: true }),
            title: titleOf(id),
            text: i === 0 ? `not approved — ${failed.error}` : 'not approved — not tried, because the one before it could not be saved.',
          }))
        : []),
    ]
    const why = failed
      ? 'saving stopped part-way. Why for each is below; try the rest again in a moment'
      : gone.length > 0
        ? 'why for each is below'
        : 'open each to finish it'
    setNotice({
      tone: failed ? 'critical' : approved.length > 0 ? 'positive' : 'attention',
      text:
        approved.length > 0
          ? `${plural(approved.length, 'product')} approved and on sale: ${approved.map(titleOf).join(', ')}.` +
            (details.length > 0 ? ` ${details.length} not approved — ${why}:` : '')
          : !failed && gone.length === 0
            ? 'None approved — every one still has fields to check. Open each to finish it:'
            : `Nothing was approved — ${why}:`,
      details,
    })
    setPicked((prev) => new Set([...prev].filter((id) => !approved.includes(id) && !gone.includes(id))))
    void fetchQueue(true)
  }

  const onPulled = useCallback((id: string, next: { product: CatalogueProduct; remaining: string[] }) => {
    setLoad((l) =>
      l.status === 'ready'
        ? {
            ...l,
            entries: l.entries.map((e) =>
              e.product.id === id ? { product: next.product, remaining: next.remaining, complete: next.remaining.length === 0 } : e,
            ),
          }
        : l,
    )
  }, [])

  const onPullFinished = useCallback(() => void fetchQueue(true), [fetchQueue])

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <div>
        <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
          Waiting for review
        </h2>
        <p style={{ fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)', marginTop: 'var(--space-1)', maxWidth: '44rem' }}>
          Products added from PowerBody wait here, out of the shop and the quiz, until you approve them. PowerBody send
          the product; the stack slots, goals and card copy are worked out by us — and those decide who gets recommended
          it, so a person checks them first. Open one to check it on its own page.
        </p>
      </div>

      {notice && <NoticeView notice={notice} />}

      {load.status === 'loading' && (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }} aria-busy="true" aria-label="Loading the review queue">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} height="var(--control-lg)" radius="var(--radius-card)" />
          ))}
        </div>
      )}

      {load.status === 'signed-out' && (
        <Note tone="attention" icon="lock" live="assertive">
          Your session has expired, so the queue could not be loaded. Nothing in it has changed.{' '}
          {/* A full page load: the sign-in screen is drawn by the hub's root layout. */}
          <a href={REVIEW_HREF} style={LINK}>
            Sign in again
          </a>
        </Note>
      )}

      {load.status === 'failed' && (
        <EmptyState
          icon="alert-triangle"
          title="The review queue could not be loaded"
          action={
            <Button variant="secondary" size="sm" icon="refresh" onClick={() => void fetchQueue()}>
              Try again
            </Button>
          }
        >
          {load.message} Nothing has changed — this only failed to read it.
        </EmptyState>
      )}

      {load.status === 'ready' && entries.length === 0 && (
        <EmptyState
          icon="check"
          title="Nothing waiting for review"
          action={
            <Link href={ADD_PRODUCTS_HREF} {...buttonSurface('primary', 'sm')}>
              Add products
            </Link>
          }
        >
          Products you add from PowerBody land here to be checked before they go on sale.
        </EmptyState>
      )}

      {load.status === 'ready' && entries.length > 0 && (
        <>
          <PullAll
            entries={entries}
            onPulled={onPulled}
            onFinished={onPullFinished}
            onRunningChange={setPulling}
            onCurrent={setFillingId}
          />

          {/* Always shown, so clearing a queue of a hundred does not start by
              ticking a hundred boxes. */}
          <Card padding="tight" as="section">
            <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
              <Checkbox
                label={allPicked ? 'Untick all' : `Tick all ${entries.length}`}
                checked={allPicked}
                onChange={() => {
                  setConfirmDiscard(null)
                  setPicked(allPicked ? new Set() : new Set(entries.map((e) => e.product.id)))
                }}
              />
              <span className="flex-1" />
              <Link href={productHref(entries[0].product.id, undefined, { queue: true })} {...buttonSurface('primary', 'sm')}>
                Review all {entries.length}, one at a time
              </Link>
              <Button
                size="sm"
                variant="secondary"
                icon="check"
                loading={busy === 'approve'}
                disabled={locked || (picked.size > 0 ? readyPicked.length === 0 : readyAll.length === 0)}
                onClick={() => void approveReady()}
              >
                {picked.size > 0
                  ? `Approve the ${readyPicked.length} ticked that ${readyPicked.length === 1 ? 'is' : 'are'} fully checked`
                  : `Approve the ${readyAll.length} fully checked`}
              </Button>
            </div>

            {picked.size > 0 && (
              <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                <span style={META}>{picked.size} ticked:</span>
                <Button
                  size="sm"
                  variant="secondary"
                  icon="bundle1"
                  disabled={locked || picked.size < 2}
                  aria-expanded={combining}
                  onClick={() => setCombining((v) => !v)}
                >
                  Combine as flavours of one product
                </Button>
                <Button size="sm" variant="destructive" icon="trash" loading={busy === 'discard'} disabled={locked} onClick={() => void discard()}>
                  {confirmDiscard === picked.size
                    ? `Tap again to discard ${picked.size} — this cannot be undone`
                    : `Discard ${picked.size}`}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={clearSelection}>
                  Clear
                </Button>
              </div>
            )}

            {picked.size > 0 && readyPicked.length === 0 && (
              <p style={{ ...META, marginTop: 'var(--space-2)' }}>
                None of the ticked ones is fully checked yet, so there is nothing to approve — open each to tick off what is
                left.
              </p>
            )}
            {picked.size === 1 && (
              <p style={{ ...META, marginTop: 'var(--space-2)' }}>Tick at least two to combine them.</p>
            )}
            {pulling && picked.size > 0 && (
              <p style={{ ...META, marginTop: 'var(--space-2)' }}>
                The PowerBody fill is writing to these products — stop it, or let it finish, before combining, discarding
                or approving.
              </p>
            )}

            {combining && picked.size >= 2 && (
              <div style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-3)', maxWidth: '32rem' }}>
                <p style={META}>
                  Combine only flavours of the same product: each keeps its own PowerBody SKU and becomes one of its
                  flavours. Different sizes must stay separate products — one price, one serving count and one picture
                  would be wrong for all but one of them.
                </p>
                <Input
                  label="Name for the combined product"
                  hint="Leave blank to use the name the flavours share."
                  value={combineTitle}
                  onChange={(e) => setCombineTitle(e.target.value)}
                  placeholder="e.g. Impact Whey Protein 1kg"
                />
                <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
                  <Button size="sm" variant="primary" loading={busy === 'combine'} disabled={locked} onClick={() => void combine()}>
                    Combine {picked.size}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCombining(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <ul style={{ display: 'grid', gap: 'var(--space-2)' }} aria-label="Products waiting for review">
            {entries.map((entry) => (
              <QueueRow
                key={entry.product.id}
                entry={entry}
                picked={picked.has(entry.product.id)}
                onToggle={() => toggle(entry.product.id)}
                filling={pulling && fillingId === entry.product.id}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function NoticeView({ notice }: { notice: Notice }) {
  return (
    <Note
      tone={notice.tone}
      icon={notice.tone === 'positive' ? 'check' : notice.tone === 'info' ? 'info' : 'alert-triangle'}
      live={notice.tone === 'critical' ? 'assertive' : 'polite'}
    >
      {notice.text}
      {notice.links?.map((l) => (
        <span key={l.href}>
          {' '}
          <Link href={l.href} style={LINK}>
            {l.label}
          </Link>
        </span>
      ))}
      {notice.details && notice.details.length > 0 && (
        <ul style={{ display: 'grid', gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>
          {notice.details.map((d, i) => (
            <li key={`${i}:${d.href ?? d.title}`} style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-loose)' }}>
              {d.href ? (
                <Link href={d.href} style={LINK}>
                  {d.title}
                </Link>
              ) : (
                <span style={{ fontWeight: 'var(--weight-strong)' }}>{d.title}</span>
              )}{' '}
              — {d.text}
            </li>
          ))}
        </ul>
      )}
    </Note>
  )
}
