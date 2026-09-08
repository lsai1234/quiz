'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { servingsForVariant } from '@/lib/shop/per-serving'
import { commonProductName, nameSwap, withoutProductName } from '@/lib/supplier/variant-labels'
import { masterVariant, masterPatch } from '@/lib/catalogue/master'
import { applyTree } from '@/lib/catalogue/tree'
import { liveServings } from '@/lib/catalogue/servings'
import { skuGroups, mixedSizes } from '@/lib/catalogue/split'
import { Badge, Button, Card, Checkbox, Input, Note, buttonSurface } from '@/components/system'

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

/** What we hold for one SKU, in the columns that decide what to do about it. */
function known(product: CatalogueProduct, variant: CatalogueVariant): string {
  const servings = servingsForVariant(product, variant)
  return [
    variant.sku ?? 'no SKU',
    (variant.size ?? '').trim() || 'no size',
    variant.servings != null
      ? `${variant.servings} servings`
      : servings != null
        ? `${Math.round(servings)} servings*`
        : 'no servings',
    variant.imageUrl ? 'own picture' : 'product picture',
    variant.cost != null ? `cost £${variant.cost.toFixed(2)}` : 'no cost',
    ...(variant.available ? [] : ['sold out']),
  ].join(' · ')
}

const EYEBROW = {
  fontSize: 'var(--text-micro)',
  letterSpacing: 'var(--tracking-eyebrow)',
  color: 'var(--ink-3)',
  textTransform: 'uppercase',
} as const

/**
 * One product, drawn as what it actually is — and taken apart when it is really
 * two products sharing a page.
 *
 * ── The two things that were one thing ──────────────────────────────────────
 * A PowerBody row lists a main SKU and everything hanging off it, and import
 * merged the lot into one product with variants. But their sheet hangs two
 * different kinds of thing off a master SKU, and only one of them is a variant
 * of anything:
 *
 *   FLAVOURS      six 500g bags that differ only in flavour   → one product
 *   UNITS OF SALE 100 capsules beside a 454g bag              → two products
 *
 * Merged, the second kind shares a page, a photograph and ONE of the two
 * prices — whichever SKU happened to be the master. So this screen does two
 * jobs: it says which SKU the product presents itself as, and it lets the SKUs
 * that were never flavours be moved onto pages of their own.
 *
 * ── Saying which is which, out loud ─────────────────────────────────────────
 * The badge was not enough. "Master SKU" on the second of seven equal rows is
 * an annotation on a list, and a founder reading it still has to work out what
 * follows from it. So the product card carries the master's photograph, price
 * and serving count and names the SKU they came from, the master sits alone
 * under a heading that says what it is for, and the flavours sit under a
 * heading that says they share the page. Nothing about the arrangement needs
 * explaining afterwards.
 *
 * ── What the master decides, and what it does not ───────────────────────────
 * Decides: the shelf price, the photograph, the cost the margin is read off,
 * the serving count. Does not decide: the product's NAME. A master SKU is
 * still one flavour, and naming a product after it is the bug that put
 * "Vegan Protein, Banana - 500 grams" on a six-flavour product.
 *
 * ── Nothing saves until Save ────────────────────────────────────────────────
 * Naming and the master are staged; a name is a sentence somebody is part-way
 * through typing. Moving SKUs out is not staged — it is a structural change to
 * two products, so it is its own action with its own confirmation, and it
 * takes you to the new product afterwards.
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
  const [splitting, setSplitting] = useState(false)
  const [applying, setApplying] = useState(false)

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
  /** SKUs ticked to be moved onto a product of their own. */
  const [moving, setMoving] = useState<Set<string>>(() => new Set())

  const withSkus = product.variants.filter((v) => v.sku).length
  const suggestion = commonProductName(labels)
  /*
    Per row: is the product's title this row's label plus something more?

    The signature of the name mix-up, provable from the two strings alone — no
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

  /*
    What "this one is the master, the rest are flavours" would do to the names.

    Computed against what is ON SCREEN — the staged labels and title — not the
    stored product, so a founder who has typed something keeps it, and so the
    preview is of the thing they are actually looking at.
  */
  const staged: CatalogueProduct = {
    ...product,
    title,
    variants: product.variants.map((v, i) => ({ ...v, title: (labels[i] ?? '').trim() || v.title })),
  }
  const plan = masterId ? applyTree(staged, masterId) : null
  const planTitle = plan?.title ?? title
  const planLabels = plan?.variants
  const planChanges = planLabels
    ? staged.variants
        .map((v, i) => ({ sku: v.sku ?? v.id, from: v.title, to: planLabels[i].title }))
        .filter((c) => c.from !== c.to)
    : []

  const master = product.variants.find((v) => v.id === masterId)
  const flavours = product.variants.filter((v) => v.id !== masterId)
  const indexOf = (v: CatalogueVariant) => product.variants.findIndex((x) => x.id === v.id)

  // The sizes this product actually holds. More than one is the evidence that
  // it is two products, and the sentence that says so needs the figures.
  const groups = skuGroups(product)
  const mixed = mixedSizes(product)
  const strangers = mixed ? groups.filter((g) => g !== groups[0]) : []
  const movingAll = moving.size >= product.variants.length

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

  /**
   * Move the ticked SKUs onto a product of their own.
   *
   * Not staged with the names: it rewrites two products, and it changes what is
   * on this page underneath the founder. It ends by going to the new product,
   * which is where the next thing to do is — naming it, and checking the
   * description it inherited still describes it.
   */
  async function split() {
    setSplitting(true)
    setError(null)
    setDone(null)
    try {
      const res = await fetch('/api/portal/products/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id, variantIds: [...moving] }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? `Could not split that product (HTTP ${res.status}).`)
        return
      }
      invalidateCatalogue()
      router.push(`/founderhub/products/dashboard/${body.moved.id}`)
      router.refresh()
    } catch {
      setError('Unable to reach the server.')
    } finally {
      setSplitting(false)
    }
  }

  /**
   * Set the tree: this SKU is the master, the rest are flavours, and the names
   * follow from that.
   *
   * One request and one write, because it is one decision — see `applyTree`.
   * The staged state is moved to what was applied, since the page's own inputs
   * are seeded once and a server refresh alone would leave the boxes showing
   * the names that have just been replaced.
   */
  async function apply() {
    if (!plan) return
    setApplying(true)
    setError(null)
    setDone(null)
    try {
      const res = await fetch('/api/portal/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id, patch: plan }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? `Could not apply that (HTTP ${res.status}).`)
        return
      }
      if (plan.title) setTitle(plan.title)
      if (plan.variants) setLabels(plan.variants.map((v) => v.title))
      setMasterId(plan.defaultVariantId ?? masterId)
      setDone(
        `Applied. The shop shows “${planTitle}”, priced and pictured from the master, with ${flavours.length} flavour${flavours.length === 1 ? '' : 's'} under it.`,
      )
      invalidateCatalogue()
      router.refresh()
    } catch {
      setError('Unable to reach the server.')
    } finally {
      setApplying(false)
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

  const tick = (id: string, on: boolean) =>
    setMoving((all) => {
      const next = new Set(all)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  /*
    One SKU in the tree.

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

          <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)', overflowWrap: 'anywhere' }}>
            {known(product, v)}
            {changed?.[v.sku ?? ''] ? ` · just now: ${changed[v.sku ?? '']}` : ''}
          </p>

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
                The two ends of the NAME are the wrong way round on this row,
                and both go back at once. Copying the label up to the title is
                half of it, and the half that still looks wrong in the shop: the
                product and one of its flavours are then both called "Vegan
                Protein", and the picker offers a flavour by the product's name.
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
            {/*
              Labelled on screen, and named per row for a screen reader.

              A bare tick box beside a SKU is a control whose meaning you have
              to guess, on the one screen whose whole problem was that nothing
              said what anything was. `aria-label` wins over the visible text
              as the accessible name, so eight boxes all reading "Move out" are
              still eight distinct controls in a screen reader's list.
            */}
            <Checkbox
              label="Move out"
              aria-label={`Move ${v.sku ?? v.title} to its own product`}
              checked={moving.has(v.id)}
              onChange={(e) => tick(v.id, e.target.checked)}
            />
          </div>
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
        The product itself — the root of the tree, wearing what the master gives
        it. The photograph and the price are here rather than only in the shop
        because they are the whole consequence of the choice below: seeing the
        capsules' photo above a list of powders is the fastest way to know the
        master is wrong.
      */}
      <Card elevation={2} className="space-y-3">
        <p style={EYEBROW}>The product — what the shop sells</p>
        <div className="flex gap-3">
          <div
            className="w-16 h-16 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--edge)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.title} className="w-full h-full object-cover" />
            ) : (
              <span style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>No image</span>
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <Input
              label="Product name"
              compact
              className="w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
              £{product.basePrice.toFixed(2)}
              {/* The master's count, which is the one on the shelf — not
                  `product.servings`, which the shop stops reading the moment a
                  SKU has its own. */}
              {liveServings(product) ? ` · ${liveServings(product)} servings` : ''} · {product.category} · /product/
              {product.handle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {suggestion && suggestion !== title.trim() && (
            <Button variant="ghost" size="sm" onClick={() => setTitle(suggestion)}>
              Use “{suggestion}”
            </Button>
          )}
          {trimmable > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setLabels((all) => all.map((l, i) => withoutProductName(l, title, product.variants[i].size)))
              }
            >
              Take “{title.trim()}” off {trimmable} flavour name{trimmable === 1 ? '' : 's'}
            </Button>
          )}
        </div>
      </Card>

      {/*
        The evidence that this is two products, with the figures in it.

        Not a rule that fires: a founder is the one who knows whether their
        "20 x 60g" and "12 x 60g" gels are one product or two. This says what
        the sizes are and ticks the odd ones for them.
      */}
      {mixed && (
        <Note tone="attention">
          <p>
            These {product.variants.length} SKUs are {groups.length} different sizes:{' '}
            {groups.map((g) => `${g.variants.length} × ${g.label}`).join(', ')}. A different size is a different
            unit of sale — its own price, its own photograph, its own serving count — so it usually belongs on a
            page of its own rather than in this one’s flavour list.
          </p>
          {/*
            One button per size, not one for "everything that is not the main
            size". Three sizes are THREE products, and ticking two of them
            together would move them onto one page — the same merge, one level
            down. A split moves one unit of sale at a time.
          */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {strangers.map((g) => (
              <Button
                key={g.key}
                variant="secondary"
                size="sm"
                onClick={() => setMoving(new Set(g.variants.map((v) => v.id)))}
              >
                Tick the {g.variants.length} × {g.label}
              </Button>
            ))}
          </div>
        </Note>
      )}

      {/* The tree. One rail, the master hanging off it first, the flavours
          under that — the shape a founder is trying to see. */}
      <div style={{ borderLeft: '1px solid var(--edge)', paddingLeft: 'var(--space-2)' }} className="space-y-2">
        <div>
          <p style={EYEBROW}>The master SKU</p>
          <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
            The product above shows this SKU’s price, photograph and serving count, and its page opens on it.
          </p>
        </div>
        {master ? (
          node(master, true)
        ) : (
          <Note tone="attention">This product has no SKUs, so there is nothing to be the master.</Note>
        )}

        {flavours.length > 0 && (
          <>
            <div style={{ paddingTop: 'var(--space-2)' }}>
              <p style={EYEBROW}>
                {flavours.length} flavour{flavours.length === 1 ? '' : 's'}
              </p>
              <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
                Sold on the same page, chosen from the picker. Anything here that is not simply another flavour of
                the same tub should be moved out.
              </p>
            </div>
            <div className="space-y-2">{flavours.map((v) => node(v, false))}</div>
          </>
        )}
      </div>

      {/*
        What the tree would become, and the one press that makes it so.

        Shown rather than described. This rewrites the product's name and every
        flavour's, which is the most visible thing on the shelf, and a founder
        working through fifteen products should be able to see the answer before
        they take it rather than pressing and checking the shop.
      */}
      {plan && (
        <Card elevation={2} tone="accent" className="space-y-2">
          <p style={EYEBROW}>Apply this tree</p>
          {planTitle !== title && (
            <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>
              The product becomes <strong>{planTitle}</strong>{' '}
              <span style={{ color: 'var(--ink-3)' }}>(was “{title}”)</span>
            </p>
          )}
          {planChanges.length > 0 && (
            <ul style={{ display: 'grid', gap: 'var(--space-1)', margin: 0, padding: 0, listStyle: 'none' }}>
              {planChanges.map((c) => (
                <li key={c.sku} style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)', overflowWrap: 'anywhere' }}>
                  {c.sku}: <span style={{ color: 'var(--ink-2)' }}>{c.to}</span> (was “{c.from}”)
                </li>
              ))}
            </ul>
          )}
          <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
            The master gives the product its price, photograph, cost and serving count. Names come from what the
            SKUs share — the product&rsquo;s name comes off the front of each flavour, and the pack size they all
            repeat comes off the end. The web address does not change.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="primary" loading={applying} disabled={applying} onClick={() => void apply()}>
              Apply
            </Button>
            <span style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
              Or type the names yourself above and press Save changes.
            </span>
          </div>
        </Card>
      )}

      {moving.size > 0 && (
        <Card elevation={2} tone={movingAll ? 'critical' : 'attention'} className="space-y-2">
          <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>
            {moving.size} SKU{moving.size === 1 ? '' : 's'} ticked to move out.
          </p>
          <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
            {movingAll
              ? 'Every SKU is ticked, which is not a split — leave at least one behind.'
              : 'They get a product of their own: their own page, price, photograph and serving count, taking the description and category from this one. You will land on it to give it a name.'}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="primary"
              loading={splitting}
              disabled={splitting || movingAll}
              onClick={() => void split()}
            >
              Move {moving.size} SKU{moving.size === 1 ? '' : 's'} into their own product
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMoving(new Set())}>
              Clear
            </Button>
          </div>
        </Card>
      )}

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
                : 'Rename anything above, or press a role to move it. Moving SKUs out is its own action.'}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="secondary" loading={busy} disabled={busy || withSkus === 0} onClick={() => void pull()}>
            Pull {withSkus} SKU{withSkus === 1 ? '' : 's'} from PowerBody
          </Button>
          <span style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
            {withSkus === 0
              ? 'No supplier codes on this product, so there is nothing to ask about.'
              : 'Reads each SKU’s own price, size, serving count and picture. A price you set by hand is left alone. A serving count marked * was scaled from the size rather than told to us.'}
          </span>
        </div>

        {done && <Note tone="positive" live="polite">{done}</Note>}
        {error && <Note tone="attention" live="polite">{error}</Note>}
      </Card>
    </div>
  )
}
