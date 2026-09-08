'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { servingsForVariant } from '@/lib/shop/per-serving'
import { commonProductName, nameSwap, withoutProductName } from '@/lib/supplier/variant-labels'
import { masterVariant, masterPatch } from '@/lib/catalogue/master'
import { Badge, Button, Card, Input, Note, buttonSurface } from '@/components/system'

interface Props {
  product: CatalogueProduct
}

interface RunReport {
  asked: number
  answered: number
  unindexed: string[]
  pricesFound: number
  servingsFound: number
  picturesFound: number
  slow: boolean
  elapsedMs: number
  error: string | null
}

/** What we hold for one SKU, in the columns that decide whether to pull. */
function known(product: CatalogueProduct, variant: CatalogueVariant): string {
  const servings = servingsForVariant(product, variant)
  return [
    variant.servings != null
      ? `${variant.servings} servings`
      : servings != null
        ? `${Math.round(servings)} servings*`
        : 'no servings',
    variant.imageUrl ? 'own picture' : 'product picture',
    variant.cost != null ? `cost £${variant.cost.toFixed(2)}` : 'no cost',
  ].join(' · ')
}

/**
 * One product, drawn as what it actually is: a product, the SKU it presents
 * itself as, and the SKUs hanging off that one.
 *
 * ── Why a tree, and why a page of its own ───────────────────────────────────
 * PowerBody sell a seven-flavour product as seven SKUs, one of which is the
 * listing the other six hang off. Import merged them into one product and kept
 * that arrangement implicitly — the row's main SKU gave the product its
 * picture, price and serving count, everything else became "a variant", and
 * nothing recorded which was which or let anybody change it.
 *
 * The flat list this replaces could say which SKU was the master, in a badge,
 * and that is not the same as showing the shape. Seven equal rows with one
 * chip on the second of them is a list with an annotation; the founder's
 * question — "which one IS this product, and what hangs off it?" — is a
 * question about a hierarchy, and it is answered by drawing the hierarchy.
 *
 * So: the product at the top with the name it goes on the shelf under, the
 * master beneath it carrying the facts that describe one unit, and the rest
 * beneath that as flavours. Roles are moved by pressing the role you want.
 *
 * ── What the master decides, and what it does not ───────────────────────────
 * Decides: the shelf price, the photograph, the cost the margin is read off,
 * and the serving count. Does not decide: the product's NAME. A master SKU is
 * still one flavour, and naming a product after it is the bug that put
 * "Vegan Protein, Banana - 500 grams" on a six-flavour product. Naming is the
 * other pair of controls here, and it is deliberately separate.
 *
 * ── Nothing saves until Save ────────────────────────────────────────────────
 * Every control below stages a change. A name is a sentence somebody is
 * part-way through typing, and a swap is usually followed by a trim; saving on
 * each of those would write half-finished names to a live shop. What is typed
 * is stored as a founder override, so no later pull from PowerBody overwrites
 * it, and the HANDLE never moves — it is the product's URL.
 */
export function ProductTree({ product }: Props) {
  /*
    The page is server-rendered, so a write is only finished once the server has
    re-read it. `refresh` re-runs the page and hands this component the stored
    product — which is what turns Save back off, and what puts the figures a
    pull just fetched into the tree without anybody reloading. The staged state
    is not re-seeded (a `useState` initialiser runs once), which is right: it
    now equals what was saved.
  */
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [changed, setChanged] = useState<Record<string, string> | null>(null)
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState(product.title)
  const [labels, setLabels] = useState<string[]>(() => product.variants.map((v) => v.title))
  /*
    Which SKU is the master, staged like the names are.

    Seeded from `masterVariant` rather than from `defaultVariantId` directly, so
    the tree shows the SKU the shop is ACTUALLY presenting: a stored master that
    has sold out is not the one on the shelf, and drawing the tree around it
    would describe something that is not happening.
  */
  const [masterId, setMasterId] = useState<string | null>(() => masterVariant(product)?.id ?? null)

  const withSkus = product.variants.filter((v) => v.sku).length
  const suggestion = commonProductName(labels)
  /*
    Per row: is the product's title this row's label plus something more?

    The signature of the mix-up, provable from the two strings alone — no
    supplier call, and no need for the siblings to agree with each other.
    `titleFromSiblings` works from what every sibling shares, which finds
    nothing on a half-repaired product ("Vegan Protein, …" beside "Protein, …"
    share no opening word), and that is exactly the product that needs this.
  */
  const swaps = product.variants.map((v, i) => nameSwap(title, labels[i] ?? '', v.size))
  const trimmable = product.variants.filter(
    (v, i) => withoutProductName(labels[i] ?? '', title, v.size) !== (labels[i] ?? '').trim(),
  ).length

  const renamed = title !== product.title || labels.some((l, i) => l !== product.variants[i].title)
  const remastered = masterId != null && masterId !== (masterVariant(product)?.id ?? null)
  const edited = renamed || remastered

  const master = product.variants.find((v) => v.id === masterId)
  const others = product.variants.filter((v) => v.id !== masterId)
  const indexOf = (v: CatalogueVariant) => product.variants.findIndex((x) => x.id === v.id)

  async function save() {
    setSaving(true)
    setError(null)
    setDone(null)
    try {
      /*
        Both edits in one write, because they are one thought: "this row is the
        product, that row is the master". Two saves would leave a founder who
        pressed once with half of it done.

        The master's facts are only sent when the founder actually picked a
        different SKU. Saving a NAME must not quietly rewrite a product's shelf
        price because the master it was already showing had never been written
        down.
      */
      const patch = remastered && masterId ? masterPatch(product, masterId) : null
      const res = await fetch('/api/portal/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: product.id,
          patch: {
            ...(patch ?? {}),
            title: title.trim() || product.title,
            // The label and the flavour move together: the shop's picker reads
            // `flavour` and falls back to `title`, so setting one and not the
            // other is how a product ends up named two different things.
            variants: product.variants.map((v, i) => {
              const label = (labels[i] ?? '').trim() || v.title
              return { ...v, title: label, flavour: label }
            }),
          },
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? `Could not save that (HTTP ${res.status}).`)
        return
      }
      setDone(
        patch
          ? 'Saved. The shop now takes this product’s price, picture and serving count from the master SKU.'
          : 'Saved. A pull from PowerBody will not overwrite those names.',
      )
      invalidateCatalogue()
      router.refresh()
    } catch {
      setError('Unable to reach the server.')
    } finally {
      setSaving(false)
    }
  }

  async function pull() {
    setBusy(true)
    setError(null)
    setDone(null)
    setChanged(null)
    try {
      const res = await fetch('/api/portal/products/repair-variant-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id }),
      })
      const body = await res.json().catch(() => null)
      // A reply that is not JSON is our own timeout, not the supplier's
      // silence — blaming PowerBody for it sends somebody to check the wrong
      // thing.
      if (!body) {
        setError(`The pull ran out of time (HTTP ${res.status}). Press it again — it saves what it reads.`)
        return
      }
      if (!res.ok || body.ok === false) {
        setError(body.error ?? `The pull failed (HTTP ${res.status}).`)
        return
      }

      const report = body.report as RunReport | undefined
      const repair = (body.repaired ?? [])[0] as { changed: Record<string, string> } | undefined
      const count = Object.keys(repair?.changed ?? {}).length
      setChanged(repair?.changed ?? {})
      setDone(
        count > 0
          ? `${count} SKU${count === 1 ? '' : 's'} updated.`
          : 'Nothing changed — PowerBody agree with what we already hold.',
      )
      if (report?.error) setError(`PowerBody said: ${report.error}`)
      else if (report && report.answered < report.asked) {
        setError(
          `PowerBody answered for ${report.answered} of ${report.asked} SKUs.` +
            (report.unindexed.length > 0
              ? ` ${report.unindexed.join(', ')} ${report.unindexed.length === 1 ? 'is' : 'are'} not in the crawled product list — run the feed index on the PowerBody screen first.`
              : ''),
        )
      }
      invalidateCatalogue()
      router.refresh()
    } catch {
      setError('Unable to reach the server.')
    } finally {
      setBusy(false)
    }
  }

  /*
    One SKU in the tree: its role, its name, and what we hold for it.

    A function that is CALLED, not a nested component. A component declared
    inside a render is a new type on every render, so React unmounts and
    remounts it — and an input that remounts loses focus after every keystroke,
    which is unusable on the one screen whose whole job is typing names.
  */
  const node = (v: CatalogueVariant, isMaster: boolean) => {
    const i = indexOf(v)
    const swap = swaps[i]
    return (
      <div key={v.id} className="flex items-stretch" style={{ minWidth: 0 }}>
        {/* The branch. A hairline stub off the rail, so a node reads as hanging
            from the product rather than sitting in a list beside it. */}
        <span
          aria-hidden
          className="flex-shrink-0 self-start"
          style={{ width: 'var(--space-4)', marginTop: 'var(--space-4)', borderTop: '1px solid var(--edge)' }}
        />
        <Card solid padding="tight" tone={isMaster ? 'accent' : undefined} className="flex-1 min-w-0 space-y-2">
          <div className="flex items-baseline gap-2">
            {/* `min-w-0` on the shrinking cell for the same reason the tree's
                columns are clamped: a flex child's minimum width is its
                content, and a sixty-character supplier name will not shrink. */}
            <Input
              label={`Name for ${v.sku ?? v.title}`}
              hideLabel
              compact
              className="flex-1 min-w-0"
              value={labels[i] ?? ''}
              onChange={(e) => setLabels((all) => all.map((l, j) => (j === i ? e.target.value : l)))}
            />
            <span className="flex-shrink-0" style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>
              £{v.price.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isMaster ? (
              <Badge tone="accent">Master SKU</Badge>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Make ${v.sku ?? v.title} the master SKU`}
                onClick={() => setMasterId(v.id)}
              >
                Make this the master
              </Button>
            )}
            {swap ? (
              /*
                The two ends are the wrong way round on THIS row, and both go
                back at once. Copying the label up to the title is half of it,
                and the half that still looks wrong in the shop: the product and
                one of its flavours are then both called "Vegan Protein", and
                the picker offers a flavour by the product's name.
              */
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Make “${swap.title}” the product name and call this row “${swap.label}”`}
                onClick={() => {
                  setTitle(swap.title)
                  setLabels((all) => all.map((l, j) => (j === i ? swap.label : l)))
                }}
              >
                This row is the product name
              </Button>
            ) : (
              (labels[i] ?? '').trim() &&
              (labels[i] ?? '').trim() !== title.trim() && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Use “${labels[i]}” as the product name`}
                  onClick={() => setTitle(labels[i])}
                >
                  Use as the product name
                </Button>
              )
            )}
          </div>

          {/* Wraps rather than truncates: four short facts, and losing the last
              one to an ellipsis loses the one saying whether the picture is
              this flavour's own. */}
          <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)', overflowWrap: 'anywhere' }}>
            {v.sku ?? 'no SKU'} · {known(product, v)}
            {v.available ? '' : ' · sold out'}
            {changed?.[v.sku ?? ''] ? ` · just now: ${changed[v.sku ?? '']}` : ''}
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4" style={{ maxWidth: 'var(--modal-lg)' }}>
      <Link href="/founderhub/products/dashboard" {...buttonSurface('ghost', 'sm')}>
        ← Back to the dashboard
      </Link>

      {/*
        The product itself — the root of the tree.

        Its name is first because it is what the shelf shows and it is the
        thing that was wrong: a product wearing one of its flavours' names.
        Everything below it is a flavour of this.
      */}
      <Card elevation={2} className="space-y-3">
        <div className="flex items-end gap-2 flex-wrap">
          <Input
            label="Product name"
            compact
            className="flex-1 min-w-0"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          {suggestion && suggestion !== title.trim() && (
            <Button variant="ghost" size="sm" onClick={() => setTitle(suggestion)}>
              Use “{suggestion}”
            </Button>
          )}
        </div>
        {trimmable > 0 && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setLabels((all) => all.map((l, i) => withoutProductName(l, title, product.variants[i].size)))
              }
            >
              Take “{title.trim()}” off {trimmable} flavour name{trimmable === 1 ? '' : 's'}
            </Button>
          </div>
        )}
        <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
          {product.category} · /product/{product.handle} · {product.variants.length} SKU
          {product.variants.length === 1 ? '' : 's'}
        </p>
      </Card>

      {/* The tree. One rail, the master hanging off it first, the flavours
          under that — the shape the founder is trying to see. */}
      <div style={{ borderLeft: '1px solid var(--edge)', paddingLeft: 'var(--space-2)' }} className="space-y-2">
        <p
          style={{
            fontSize: 'var(--text-micro)',
            letterSpacing: 'var(--tracking-eyebrow)',
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
          }}
        >
          The SKU this product is
        </p>
        {master ? (
          node(master, true)
        ) : (
          <Note tone="attention">This product has no SKUs, so there is nothing to be the master.</Note>
        )}

        {others.length > 0 && (
          <>
            <p
              style={{
                fontSize: 'var(--text-micro)',
                letterSpacing: 'var(--tracking-eyebrow)',
                color: 'var(--ink-3)',
                textTransform: 'uppercase',
                paddingTop: 'var(--space-2)',
              }}
            >
              {others.length} more SKU{others.length === 1 ? '' : 's'}, sold as flavours of it
            </p>
            <div className="space-y-2">
              {others.map((v) => node(v, false))}
            </div>
          </>
        )}
      </div>

      <Card elevation={1} className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="primary" loading={saving} disabled={saving || !edited} onClick={() => void save()}>
            Save changes
          </Button>
          <span style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
            {remastered
              ? 'The shop will take the price, picture and serving count from the master. The product’s name is unchanged.'
              : renamed
                ? 'Saved as your own wording — no pull from PowerBody will overwrite it. The web address does not change.'
                : 'Rename anything above, or press a role to move it.'}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="secondary" loading={busy} disabled={busy || withSkus === 0} onClick={() => void pull()}>
            Pull {withSkus} SKU{withSkus === 1 ? '' : 's'} from PowerBody
          </Button>
          <span style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
            {withSkus === 0
              ? 'No supplier codes on this product, so there is nothing to ask about.'
              : 'Reads each SKU’s own price, serving count and picture. A price you set by hand is left alone. A serving count marked * was scaled from the size rather than told to us.'}
          </span>
        </div>

        {done && <Note tone="positive" live="polite">{done}</Note>}
        {error && <Note tone="attention" live="polite">{error}</Note>}
      </Card>
    </div>
  )
}
