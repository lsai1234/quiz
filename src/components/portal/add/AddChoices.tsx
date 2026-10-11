'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button, Note, buttonSurface } from '@/components/system'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { REVIEW_HREF, productHref } from '@/lib/portal/product-links'
import { ExistingProductPicker } from './ExistingProductPicker'
import { addCards, type AddMode, type AddOutcome, type AddReport, type AddTarget } from './addProducts'
import { isAddable, plural, type CodeCard, type LookupGroup } from './lookup'
import type { Lookup } from './useLookup'
import { Row, Stack, TextLink, bodyText, metaText } from './ui'

/**
 * What to do with the ticked products of one group — and what came of it.
 *
 * Three ways in, because there are three different things a founder means:
 *   separate products   unrelated things, each with its own page
 *   one with flavours   the same tub in several flavours: one page, a picker
 *   flavours of X       a new flavour of something already in the shop
 *
 * For a group picked from PowerBody's spreadsheet the flavours of one product
 * arrive together, so "one product with flavours" leads. For a pasted list —
 * which is usually unrelated codes — "separate" leads. Either way the other is
 * one press away, and the server refuses a combination that would put two
 * sizes on one page, with the reason, rather than doing it.
 */
export function AddChoices({ group, lookup }: { group: LookupGroup; lookup: Pick<Lookup, 'placeCards' | 'holdCards' | 'searchAgain' | 'restore'> }) {
  const [adding, setAdding] = useState<AddMode | null>(null)
  const [report, setReport] = useState<AddReport | null>(null)
  const [picking, setPicking] = useState(false)

  const ticked = group.cards.filter((c) => isAddable(c) && c.ticked)
  const n = ticked.length
  const flavoursFirst = group.source === 'csv' && n > 1

  const go = async (cards: CodeCard[], mode: AddMode, into?: AddTarget) => {
    if (cards.length === 0) return
    setAdding(mode)
    setReport(null)
    try {
      const final = await addCards(cards, { mode, title: mode === 'combine' ? group.title : null, into: into ?? null }, setReport)
      setReport(final)
      if (final.placed.size > 0 || final.outcomes.length > 0) invalidateCatalogue()
      lookup.placeCards(final.placed)
      lookup.holdCards(final.held)
      if (mode === 'into' && !final.refused) setPicking(false)
    } finally {
      setAdding(null)
    }
  }

  if (n === 0 && !report && !adding) return null

  const separateLabel = n === 1 ? 'Add it as a product' : `Add ${n} as separate products`
  const combineLabel = `Add as one product with ${n} flavours`

  return (
    <Stack gap="var(--space-3)">
      {n > 0 && (
        <Row>
          {flavoursFirst ? (
            <>
              <Button variant="primary" size="sm" loading={adding === 'combine'} disabled={adding !== null} onClick={() => go(ticked, 'combine')}>
                {combineLabel}
              </Button>
              <Button variant="secondary" size="sm" loading={adding === 'separate'} disabled={adding !== null} onClick={() => go(ticked, 'separate')}>
                {separateLabel}
              </Button>
            </>
          ) : (
            <>
              <Button variant="primary" size="sm" loading={adding === 'separate'} disabled={adding !== null} onClick={() => go(ticked, 'separate')}>
                {separateLabel}
              </Button>
              {n > 1 && (
                <Button variant="secondary" size="sm" loading={adding === 'combine'} disabled={adding !== null} onClick={() => go(ticked, 'combine')}>
                  {combineLabel}
                </Button>
              )}
            </>
          )}
          <Button variant="ghost" size="sm" disabled={adding !== null} onClick={() => setPicking((p) => !p)} aria-expanded={picking}>
            Add as flavours of an existing product
          </Button>
        </Row>
      )}
      {n > 1 && (
        <p style={metaText}>
          One product with flavours is for the same tub in different flavours. Different sizes stay as separate
          products — each size has its own price, servings and weight.
        </p>
      )}

      {picking && n > 0 && (
        <ExistingProductPicker
          count={n}
          busy={adding === 'into'}
          onPick={(target) => go(ticked, 'into', target)}
          onCancel={() => setPicking(false)}
        />
      )}

      {report && (
        <Outcome
          report={report}
          running={adding !== null}
          group={group}
          onAddSeparately={(cards) => go(cards, 'separate')}
          onJoin={(cards, target) => go(cards, 'into', target)}
          lookup={lookup}
        />
      )}
    </Stack>
  )
}

/** What happened, and the next step. */
function Outcome({
  report,
  running,
  group,
  onAddSeparately,
  onJoin,
  lookup,
}: {
  report: AddReport
  running: boolean
  group: LookupGroup
  onAddSeparately: (cards: CodeCard[]) => void
  onJoin: (cards: CodeCard[], target: AddTarget) => void
  lookup: Pick<Lookup, 'searchAgain' | 'restore'>
}) {
  if (running) {
    return (
      <p role="status" style={bodyText}>
        {report.done} of {report.total} added…
      </p>
    )
  }

  const cardsFor = (skus: string[]) => {
    const wanted = new Set(skus.map((s) => s.toUpperCase()))
    return group.cards.filter((c) => isAddable(c) && wanted.has((c.row?.sku ?? '').toUpperCase()))
  }
  const added = report.outcomes.filter((o) => o.status === 'added')
  const elsewhere = report.outcomes.filter((o) => o.status === 'already' || o.status === 'removed')
  const notFoundCards = group.cards.filter((c) => {
    const code = c.row?.productId ?? c.row?.sku
    return code && report.notFound.includes(code)
  })
  const leftOver = group.cards.filter((c) => isAddable(c) && c.ticked)

  // Where to go next: the one product, or the queue when there are several.
  const made: Array<{ id: string; title: string }> =
    report.mode === 'separate'
      ? added.map((o) => ({ id: o.id, title: o.title }))
      : report.target && report.placed.size > 0
        ? [{ id: report.target.id, title: report.target.title }]
        : []

  return (
    <Stack gap="var(--space-2)">
      {made.length > 0 && (
        <Note tone="positive" live="polite">
          {report.mode === 'into'
            ? report.target?.state === 'live'
              ? `${plural(report.placed.size, 'flavour')} added to ${report.target.title}, which is on sale — so they are on sale now. Check their names and prices on its page.`
              : `${plural(report.placed.size, 'flavour')} added to ${report.target?.title}. They go on sale when it is approved.`
            : report.mode === 'combine'
              ? `${report.target?.title} added with ${plural(report.placed.size, 'flavour')}, waiting for review. Nothing is on sale until you approve it.`
              : `${plural(made.length, 'product')} added, waiting for review. Nothing is on sale until you approve it.`}
        </Note>
      )}

      {report.refused && (
        <Note tone="critical" live="assertive">
          {report.done > 0 ? `${report.done} of ${report.total} were added, then it stopped: ` : 'Not added: '}
          {report.refused.message}
          {report.refused.holder && (
            <>
              {' '}
              <TextLink href={productHref(report.refused.holder)}>Open that product</TextLink>
            </>
          )}
          {report.refused.sizes && leftOver.length > 0 && (
            <span className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <Button size="sm" variant="secondary" onClick={() => onAddSeparately(leftOver)}>
                Add {leftOver.length === 1 ? 'it' : `the ${leftOver.length}`} as separate products instead
              </Button>
            </span>
          )}
        </Note>
      )}

      {elsewhere.map((o) => (
        <Elsewhere key={`${o.status}-${o.id}`} outcome={o} cards={cardsFor(o.newSkus ?? [])} onJoin={onJoin} onRestore={lookup.restore} />
      ))}

      {notFoundCards.length > 0 && (
        <Note tone="attention">
          PowerBody did not return {notFoundCards.map((c) => c.row?.sku ?? c.code).join(', ')} when asked to add{' '}
          {notFoundCards.length === 1 ? 'it' : 'them'}, so {notFoundCards.length === 1 ? 'it was' : 'they were'} not added.{' '}
          <Button size="sm" variant="ghost" onClick={() => notFoundCards.forEach((c) => lookup.searchAgain(c.key, { code: c.row?.sku ?? c.code }))}>
            Look {notFoundCards.length === 1 ? 'it' : 'them'} up again
          </Button>
        </Note>
      )}

      {!report.refused && report.done < report.total && leftOver.length > 0 && (
        <p style={metaText}>
          {plural(leftOver.length, 'product')} not added yet — still ticked above. Add them to that product, or on their own.
        </p>
      )}

      {made.length === 1 && (
        <Row>
          <Link href={report.mode === 'into' ? productHref(made[0].id, 'variants') : productHref(made[0].id)} {...buttonSurface('primary', 'sm')}>
            Open {made[0].title}
          </Link>
        </Row>
      )}
      {made.length > 1 && (
        <Row>
          <Link href={REVIEW_HREF} {...buttonSurface('primary', 'sm')}>
            Next: review them
          </Link>
          <span style={metaText}>Each one is checked there before it goes on sale.</span>
        </Row>
      )}
    </Stack>
  )
}

/** A product that was already in the catalogue — a link, a Restore, and its new flavours. */
function Elsewhere({
  outcome: o,
  cards,
  onJoin,
  onRestore,
}: {
  outcome: AddOutcome
  cards: CodeCard[]
  onJoin: (cards: CodeCard[], target: AddTarget) => void
  onRestore: (id: string) => Promise<void>
}) {
  const [restoring, setRestoring] = useState(false)
  const target: AddTarget = { id: o.id, title: o.title, state: o.status === 'already' && o.state === 'live' ? 'live' : 'pending' }
  const fresh = o.newSkus ?? []
  return (
    <Note tone="attention">
      {o.status === 'removed' ? (
        <>
          <TextLink href={productHref(o.id)}>{o.title}</TextLink> already sells {o.skus?.join(', ') || 'these'}, but it
          was removed. Restore it rather than adding it twice.{' '}
          <Button
            size="sm"
            variant="secondary"
            loading={restoring}
            onClick={async () => {
              setRestoring(true)
              try {
                await onRestore(o.id)
              } finally {
                setRestoring(false)
              }
            }}
          >
            Restore
          </Button>
        </>
      ) : (
        <>
          Already in <TextLink href={productHref(o.id)}>{o.title} →</TextLink>
          {o.skus && o.skus.length > 0 ? ` (it sells ${o.skus.join(', ')})` : ''}. Nothing was changed.
        </>
      )}
      {fresh.length > 0 && (
        <span className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
          <span>
            {plural(fresh.length, 'new flavour')} ({fresh.join(', ')}) {fresh.length === 1 ? 'is' : 'are'} not on it yet.
          </span>
          {cards.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => onJoin(cards, target)}>
              Add {fresh.length === 1 ? 'it' : 'them'} to {o.title}
            </Button>
          )}
        </span>
      )}
    </Note>
  )
}
