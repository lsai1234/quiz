'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ProductBundle } from '@/lib/bundles'
import type { Goal } from '@/lib/types'
import { bundleSlug } from '@/lib/bundles/resolve'
import {
  assembleProductBundle,
  productBundleToDraft,
  emptyProductBundleDraft,
  type ProductBundleDraft,
} from '@/lib/bundles/assemble'
import { calculatePricing, formatGBP } from '@/lib/stack-blueprint/pricing'
import { Button, Card, Input, Select, Textarea } from '@/components/system'
import { ProductPicker } from './ProductPicker'

const GOALS: Goal[] = ['muscle', 'energy', 'performance', 'hydration', 'recovery', 'health', 'cutting', 'bulking', 'sleep-better', 'less-stress', 'focus', 'immune', 'skin-hair-nails', 'menopause', 'gut-health']

interface Props {
  initial: ProductBundle | null
  isNew: boolean
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card as="section" elevation={1} className="space-y-3">
      <h2
        style={{
          fontSize: 'var(--text-body-sm)',
          fontWeight: 'var(--weight-display)',
          fontFamily: 'var(--font-display)',
          color: 'var(--ink-1)',
        }}
      >
        {title}
      </h2>
      {children}
    </Card>
  )
}

/**
 * Building a pre-built bundle: the products, and why they are together.
 *
 * It is deliberately short. There is no tagline, no honesty line, no photograph
 * and no SEO — a pre-built bundle is never a page. It is the stack that session
 * stacks sell, and everything a customer reads belongs to those.
 *
 * The one thing worth saying twice: editing this changes every package built on
 * it, which is the reason it exists. The header says so, with the count.
 */
export function ProductBundleEditor({ initial, isNew }: Props) {
  const router = useRouter()
  const [products, setProducts] = useState<CatalogueProduct[]>([])
  const [draft, setDraft] = useState<ProductBundleDraft>(() =>
    initial ? productBundleToDraft(initial) : emptyProductBundleDraft(),
  )
  const [usedBy, setUsedBy] = useState<string[]>([])
  const [slugTouched, setSlugTouched] = useState(!isNew)
  const [picker, setPicker] = useState<'core' | 'addon' | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/portal/products')
      .then((r) => r.json())
      .then((d: { products?: { product: CatalogueProduct }[] }) => setProducts((d.products ?? []).map((p) => p.product)))
      .catch(() => setProducts([]))
  }, [])

  useEffect(() => {
    if (isNew || !initial) return
    // Who is selling this stack. Editing it changes all of them at once, which
    // is worth knowing before you swap a product out.
    fetch('/api/portal/bundles')
      .then((r) => r.json())
      .then((d: { bundles?: { bundle: { name: string; productBundleSlug: string | null } }[] }) =>
        setUsedBy(
          (d.bundles ?? [])
            .filter((b) => b.bundle.productBundleSlug === initial.slug)
            .map((b) => b.bundle.name),
        ),
      )
      .catch(() => setUsedBy([]))
  }, [initial, isNew])

  const set = <K extends keyof ProductBundleDraft>(key: K, value: ProductBundleDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const onName = (name: string) =>
    setDraft((d) => ({ ...d, name, slug: slugTouched ? d.slug : bundleSlug(name) }))

  const assembled = useMemo(() => assembleProductBundle(draft, products), [draft, products])
  const pricing = useMemo(
    () => (products.length && draft.cores.length ? calculatePricing(assembled.blueprint, products) : null),
    [assembled, products, draft.cores.length],
  )

  const canSave = Boolean(draft.name.trim() && draft.slug.trim() && draft.cores.length > 0)

  async function save() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    const bundle = assembleProductBundle(draft, products)
    try {
      const res = await fetch('/api/portal/product-bundles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? { action: 'create', bundle } : { action: 'edit', slug: draft.slug, patch: bundle }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Save failed'); return }
      router.push('/founderhub/products/prebuilt')
    } catch {
      setError('Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  const chosenIds = new Set([...draft.cores, ...draft.addOns].map((c) => c.productId))

  return (
    <div className="space-y-4 pb-24">
      <div className="min-w-0">
        <Button variant="ghost" size="sm" icon="arrow-left" onClick={() => router.push('/founderhub/products/prebuilt')}>
          Pre-built bundles
        </Button>
        <h1
          style={{
            fontSize: 'var(--text-display)',
            fontWeight: 'var(--weight-display)',
            fontFamily: 'var(--font-display)',
            lineHeight: 'var(--leading-tight)',
            color: 'var(--ink-1)',
            marginTop: 'var(--space-1)',
          }}
        >
          {isNew ? 'New pre-built bundle' : `Edit — ${initial?.name}`}
        </h1>
      </div>

      {error && (
        <Card tone="critical" padding="tight">
          <p role="status" style={{ fontSize: 'var(--text-body-sm)', color: 'var(--tone-critical)' }}>{error}</p>
        </Card>
      )}

      {usedBy.length > 0 && (
        <Card tone="attention" padding="tight">
          <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>
            {usedBy.length} session stack{usedBy.length === 1 ? '' : 's'} sell this: {usedBy.join(', ')}.
          </p>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
            A change here changes what every one of them ships. That is the point of a pre-built bundle — it is
            also the thing to check before swapping a product out.
          </p>
        </Card>
      )}

      <Card elevation={2} className="flex flex-wrap items-center justify-between gap-3">
        <span style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)' }}>
          {pricing ? (
            <>
              <span style={{ color: 'var(--accent)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)' }}>
                {formatGBP(pricing.oneOffTotal)}
              </span>{' '}
              one-off · {pricing.subscriptionMinOrderMet ? `${formatGBP(pricing.subscriptionTotal)}/mo` : 'no monthly'}
            </>
          ) : (
            'Add a product to price the stack'
          )}
        </span>
      </Card>

      <Section title="What it is">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Name" value={draft.name} onChange={(e) => onName(e.target.value)} placeholder="Strength" />
          <Input
            label="Reference (id)"
            value={draft.slug}
            onChange={(e) => { setSlugTouched(true); set('slug', bundleSlug(e.target.value)) }}
            disabled={!isNew}
            hint={isNew ? 'Set once. Session stacks point at it by this.' : 'Fixed — session stacks point at it.'}
            placeholder="strength"
          />
        </div>
        <Textarea
          label="What it is for"
          value={draft.description}
          onChange={(e) => set('description', e.target.value)}
          rows={2}
          placeholder="The strength stack — protein, creatine and the daily base."
        />
        <Select label="Primary goal" value={draft.primaryGoal} onChange={(e) => set('primaryGoal', e.target.value as Goal)}>
          {GOALS.map((g) => <option key={g} value={g}>{g}</option>)}
        </Select>
      </Section>

      <Section title={`Products — ${draft.cores.length}`}>
        {draft.cores.map((core, i) => {
          const product = products.find((p) => p.id === core.productId)
          return (
            <Card key={core.productId} solid padding="tight" className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p
                  className="truncate"
                  style={{
                    fontSize: 'var(--text-body-sm)',
                    fontWeight: 'var(--weight-strong)',
                    fontFamily: 'var(--font-display)',
                    color: 'var(--ink-1)',
                  }}
                >
                  {product?.title ?? core.productId}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="chevron-up"
                    aria-label={`Move ${product?.title ?? core.productId} up`}
                    disabled={i === 0}
                    onClick={() => setDraft((d) => { const c = [...d.cores]; if (i > 0) [c[i - 1], c[i]] = [c[i], c[i - 1]]; return { ...d, cores: c } })}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="chevron-down"
                    aria-label={`Move ${product?.title ?? core.productId} down`}
                    disabled={i === draft.cores.length - 1}
                    onClick={() => setDraft((d) => { const c = [...d.cores]; if (i < c.length - 1) [c[i + 1], c[i]] = [c[i], c[i + 1]]; return { ...d, cores: c } })}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="trash"
                    aria-label={`Remove ${product?.title ?? core.productId} from the stack`}
                    onClick={() => setDraft((d) => ({ ...d, cores: d.cores.filter((_, j) => j !== i) }))}
                  />
                </div>
              </div>
              <Input
                label={`Slot label for ${product?.title ?? core.productId}`}
                compact
                value={core.title}
                onChange={(e) => setDraft((d) => { const c = [...d.cores]; c[i] = { ...c[i], title: e.target.value }; return { ...d, cores: c } })}
                placeholder="Slot label, e.g. Hydration"
                className="w-full"
              />
              <Textarea
                label={`Why ${product?.title ?? core.productId} is in the stack`}
                value={core.reason}
                onChange={(e) => setDraft((d) => { const c = [...d.cores]; c[i] = { ...c[i], reason: e.target.value }; return { ...d, cores: c } })}
                rows={2}
                placeholder="Why it's in the stack (claim-safe)…"
              />
            </Card>
          )
        })}
        <Button variant="secondary" size="sm" icon="plus" fullWidth onClick={() => setPicker('core')}>
          Add product
        </Button>
      </Section>

      <Section title={`Optional add-ons — ${draft.addOns.length}`}>
        {draft.addOns.map((addon, i) => {
          const product = products.find((p) => p.id === addon.productId)
          return (
            <Card key={addon.productId} solid padding="tight" className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p
                  className="truncate"
                  style={{
                    fontSize: 'var(--text-body-sm)',
                    fontWeight: 'var(--weight-strong)',
                    fontFamily: 'var(--font-display)',
                    color: 'var(--ink-1)',
                  }}
                >
                  {product?.title ?? addon.productId}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="trash"
                  aria-label={`Remove ${product?.title ?? addon.productId} from the add-ons`}
                  onClick={() => setDraft((d) => ({ ...d, addOns: d.addOns.filter((_, j) => j !== i) }))}
                />
              </div>
              <Input
                label={`Add-on label for ${product?.title ?? addon.productId}`}
                compact
                value={addon.title}
                onChange={(e) => setDraft((d) => { const a = [...d.addOns]; a[i] = { ...a[i], title: e.target.value }; return { ...d, addOns: a } })}
                placeholder="Add-on label, e.g. Evening Reset"
                className="w-full"
              />
              <Textarea
                label={`Why someone might add ${product?.title ?? addon.productId}`}
                value={addon.reason}
                onChange={(e) => setDraft((d) => { const a = [...d.addOns]; a[i] = { ...a[i], reason: e.target.value }; return { ...d, addOns: a } })}
                rows={2}
                placeholder="Why someone might add it…"
              />
            </Card>
          )
        })}
        <Button variant="ghost" size="sm" icon="plus" fullWidth onClick={() => setPicker('addon')}>
          Add optional product
        </Button>
      </Section>

      <div
        className="fixed inset-x-0 bottom-0 z-20"
        style={{
          background: 'var(--surface-solid)',
          borderTop: '1px solid var(--edge)',
          padding: 'var(--space-3) var(--gutter)',
        }}
      >
        <div className="max-w-3xl mx-auto flex items-center justify-end gap-2">
          <Button variant="primary" onClick={save} disabled={!canSave} loading={saving}>
            {isNew ? 'Create stack' : 'Save stack'}
          </Button>
        </div>
      </div>

      {picker && (
        <ProductPicker
          products={products}
          disabledIds={chosenIds}
          onPick={(p) => {
            setDraft((d) =>
              picker === 'core'
                ? { ...d, cores: [...d.cores, { productId: p.id, title: p.category, reason: p.shortReason || '' }] }
                : { ...d, addOns: [...d.addOns, { productId: p.id, title: p.category, reason: p.shortReason || '' }] },
            )
            setPicker(null)
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}
