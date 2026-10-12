'use client'

import { useEffect, useMemo, useState, type ComponentType } from 'react'
import Link from 'next/link'
import { Button, Note } from '@/components/system'
import { DescriptionCleanupPanel } from '@/components/portal/DescriptionCleanupPanel'
import { VariantNameRepairPanel } from '@/components/portal/VariantNameRepairPanel'
import { VariantPriceRepairPanel } from '@/components/portal/VariantPriceRepairPanel'
import { ShortNamePanel } from '@/components/portal/ShortNamePanel'
import { AiSuggestPanel } from '@/components/portal/AiSuggestPanel'
import { SupplierSyncPanel } from '@/components/portal/SupplierSyncPanel'
import { FIXUPS_HREF, PRODUCTS_HREF, REVIEW_HREF } from '@/lib/portal/product-links'
import { FixupCard } from './FixupCard'
import { ProductIndexProvider, useProductIndex } from './product-index'
import type { FixupPanelProps, FixupSummary } from './types'

interface Pass {
  id: string
  title: string
  does: string
  Panel: ComponentType<FixupPanelProps>
}

/**
 * The passes, in the order a catalogue usually needs them: the text a customer
 * reads, then the flavours and what each costs, then the names and tags that
 * decide where a product shows up, then what PowerBody changed overnight.
 */
const PASSES: Pass[] = [
  {
    id: 'descriptions',
    title: 'Tidy descriptions',
    does: 'Strips the raw HTML PowerBody sent from descriptions on sale, and can rewrite their copy into our voice.',
    Panel: DescriptionCleanupPanel,
  },
  {
    id: 'flavour-names',
    title: 'Repair flavour names',
    does: 'Names flavours still showing a PowerBody code, and untangles products named after one of their own flavours.',
    Panel: VariantNameRepairPanel,
  },
  {
    id: 'sku-prices',
    title: 'Fill SKU prices, servings and pictures from PowerBody',
    does: 'Reads every SKU of every multi-SKU product from PowerBody, so each has its own cost, price, serving count and picture.',
    Panel: VariantPriceRepairPanel,
  },
  {
    id: 'short-names',
    title: 'Short names',
    does: 'Gives each product the two- or three-word name a card and the share poster have room for.',
    Panel: ShortNamePanel,
  },
  {
    id: 'tags',
    title: 'Suggest tags',
    does: 'Suggests stack slots, goals and a swap group for products on sale that have none — you keep or drop each tag before anything is saved.',
    Panel: AiSuggestPanel,
  },
  {
    id: 'supplier-check',
    title: 'Supplier check',
    does: 'Re-checks every imported product’s stock and cost against PowerBody — nightly on its own, or now.',
    Panel: SupplierSyncPanel,
  },
]

const LINK = { color: 'var(--accent)', fontWeight: 'var(--weight-strong)', textDecoration: 'underline', textUnderlineOffset: '0.2em' } as const

/**
 * Fix-ups — the passes that work across the whole catalogue at once.
 *
 * These used to stand in a big list on the PowerBody tab, all open, each with
 * its own wall of explanation, mixed in with the screens for adding products.
 * Nothing said which mattered today. Here each is one card, closed, saying in
 * one line what it does and how many products it would touch right now — so the
 * page reads as a checklist: the ones with a number need doing, the ones that
 * say "Nothing to fix" do not.
 *
 * They are for the catalogue in bulk. A single product is changed on its own
 * page, and products still waiting for review are left to Review, where every
 * field is checked before it goes on sale.
 */
export function FixUps() {
  return (
    <ProductIndexProvider>
      <FixUpsBody />
    </ProductIndexProvider>
  )
}

function FixUpsBody() {
  const index = useProductIndex()
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [running, setRunning] = useState<Record<string, boolean>>({})
  const [summaries, setSummaries] = useState<Record<string, FixupSummary>>({})

  /*
    One set of callbacks per pass, made once. The panels report from effects
    keyed on these, so a fresh function every render would have every panel
    re-reporting on every render. Each skips the update when nothing changed.
  */
  const handlers = useMemo(
    () =>
      Object.fromEntries(
        PASSES.map((p) => [
          p.id,
          {
            onOpenChange: (next: boolean) => setOpen((o) => ({ ...o, [p.id]: next })),
            onRunning: (r: boolean) => setRunning((m) => (Boolean(m[p.id]) === r ? m : { ...m, [p.id]: r })),
            onSummary: (s: FixupSummary) =>
              setSummaries((m) => (m[p.id]?.count === s.count && m[p.id]?.line === s.line ? m : { ...m, [p.id]: s })),
          },
        ]),
      ),
    [],
  )

  // `#short-names` and friends open that pass, so a link from elsewhere (a
  // readiness check, an error message) lands on the thing it means.
  useEffect(() => {
    try {
      const hash = window.location.hash.replace(/^#/, '')
      if (hash && PASSES.some((p) => p.id === hash)) setOpen((o) => ({ ...o, [hash]: true }))
    } catch {
      /* no address to read — every card simply starts closed */
    }
  }, [])

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <div>
        <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
          Fix-ups
        </h2>
        <p style={{ fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)', marginTop: 'var(--space-1)', maxWidth: '44rem' }}>
          Passes over the whole catalogue at once. Each finds the products it applies to and fixes them together, and
          each is safe to stop and run again. To change one product, open it from{' '}
          <Link href={PRODUCTS_HREF} style={LINK}>
            Products
          </Link>
          ; products still waiting for review are left to{' '}
          <Link href={REVIEW_HREF} style={LINK}>
            Review
          </Link>
          .
        </p>
      </div>

      {index.status === 'signed-out' && (
        <Note tone="attention" icon="lock" live="assertive">
          Your session has expired, so nothing here can be counted or run.{' '}
          {/* A full page load: the sign-in screen is drawn by the hub's root layout. */}
          <a href={FIXUPS_HREF} style={LINK}>
            Sign in again
          </a>
        </Note>
      )}
      {index.status === 'failed' && (
        <Note tone="attention">
          The product list could not be read ({index.message}), so the counts below may include products still waiting
          for review, and tags cannot be suggested.{' '}
          <Button size="sm" variant="ghost" icon="refresh" onClick={index.reload}>
            Try again
          </Button>
        </Note>
      )}

      {PASSES.map((pass) => {
        const { Panel } = pass
        const on = handlers[pass.id]
        return (
          <FixupCard
            key={pass.id}
            id={pass.id}
            title={pass.title}
            does={pass.does}
            summary={summaries[pass.id] ?? null}
            running={Boolean(running[pass.id])}
            open={Boolean(open[pass.id]) || Boolean(running[pass.id])}
            onOpenChange={on.onOpenChange}
          >
            <Panel onSummary={on.onSummary} onRunningChange={on.onRunning} />
          </FixupCard>
        )
      })}
    </div>
  )
}
