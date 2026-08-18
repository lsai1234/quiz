'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { PrebuiltBundle } from '@/lib/bundles'
import type { Goal } from '@/lib/types'
import { bundleSlug } from '@/lib/bundles/resolve'
import { assembleBundle, bundleToDraft, emptyDraft, type BundleDraft } from '@/lib/bundles/assemble'
import { bundleReadiness } from '@/lib/bundles/readiness'
import { calculatePricing, formatGBP } from '@/lib/stack-blueprint/pricing'
import { BundleLandingPage } from '@/components/bundles/BundleLandingPage'
import { Badge, Button, Card, Input, Modal, ModalBody, ModalHeader, Select, Textarea } from '@/components/system'

/** Readiness status → the system's semantic tone. The colours live in `Badge`. */
const TONE = { ok: 'positive', warn: 'attention', fail: 'critical' } as const
const GOALS: Goal[] = ['muscle', 'energy', 'performance', 'hydration', 'recovery', 'health', 'cutting', 'bulking', 'sleep-better', 'less-stress', 'focus', 'immune', 'skin-hair-nails', 'menopause', 'gut-health']

interface Props {
  initial: PrebuiltBundle | null
  isNew: boolean
}

/**
 * `Section` is the one piece of local scaffolding left. It is layout — a card
 * with a heading — and everything inside it is a primitive.
 */
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

export function BundleEditor({ initial, isNew }: Props) {
  const router = useRouter()
  const [products, setProducts] = useState<CatalogueProduct[]>([])
  const [draft, setDraft] = useState<BundleDraft>(() => (initial ? bundleToDraft(initial) : emptyDraft()))
  const [slugTouched, setSlugTouched] = useState(!isNew)
  const [picker, setPicker] = useState<'core' | 'addon' | null>(null)
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/portal/products')
      .then((r) => r.json())
      .then((d: { products?: { product: CatalogueProduct }[] }) => setProducts((d.products ?? []).map((p) => p.product)))
      .catch(() => setProducts([]))
  }, [])

  const set = <K extends keyof BundleDraft>(key: K, value: BundleDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  // Auto-slug from the name until the slug is edited directly (new bundles only).
  const onName = (name: string) => setDraft((d) => ({ ...d, name, slug: slugTouched ? d.slug : bundleSlug(name) }))

  const assembled = useMemo(() => assembleBundle(draft, products), [draft, products])
  const pricing = useMemo(
    () => (products.length && draft.cores.length ? calculatePricing(assembled.blueprint, products) : null),
    [assembled, products, draft.cores.length],
  )
  const readiness = useMemo(
    () => (products.length ? bundleReadiness(assembled, products) : null),
    [assembled, products],
  )

  const canSave = draft.name.trim() && draft.slug.trim() && draft.cores.length > 0
  const canPublish = canSave && readiness?.sellable && !!draft.tagline.trim() && !!draft.description.trim() && !!draft.disclaimer.trim()

  async function save(publish: boolean) {
    if (!canSave) return
    if (publish && !canPublish) { setError('Fix the readiness checks before publishing.'); return }
    setSaving(true)
    setError(null)
    const bundle = { ...assembleBundle({ ...draft, published: publish }, products) }
    const body = isNew
      ? { action: 'create', bundle }
      : { action: 'edit', slug: draft.slug, patch: bundle }
    try {
      const res = await fetch('/api/portal/bundles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Save failed'); return }
      router.push('/founderhub/products/bundles')
    } catch {
      setError('Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  const chosenIds = new Set([...draft.cores, ...draft.addOns].map((c) => c.productId))

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Button
            variant="ghost"
            size="sm"
            icon="arrow-left"
            onClick={() => router.push('/founderhub/products/bundles')}
          >
            Bundles
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
            {isNew ? 'New bundle' : `Edit — ${initial?.name}`}
          </h1>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setPreview(true)} disabled={draft.cores.length === 0}>
          Preview
        </Button>
      </div>

      {error && (
        <Card tone="critical" padding="tight">
          <p role="status" style={{ fontSize: 'var(--text-body-sm)', color: 'var(--tone-critical)' }}>
            {error}
          </p>
        </Card>
      )}

      {/* Live readiness + price */}
      <Card elevation={2} className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center" style={{ gap: 'var(--space-3)', fontSize: 'var(--text-body-sm)' }}>
          {pricing ? (
            <>
              <span style={{ color: 'var(--accent)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)' }}>
                {formatGBP(pricing.oneOffTotal)}
              </span>
              <span style={{ color: 'var(--ink-3)' }}>
                one-off · {pricing.subscriptionMinOrderMet ? `${formatGBP(pricing.subscriptionTotal)}/mo` : 'no monthly'}
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--ink-3)' }}>Add a product to price the bundle</span>
          )}
        </div>
        {readiness && (
          <Badge tone={TONE[readiness.overall]} dot>
            {readiness.sellable ? 'Sellable' : 'Not sellable'}
          </Badge>
        )}
      </Card>

      {/* Identity & story */}
      <Section title="Identity & story">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Name" value={draft.name} onChange={(e) => onName(e.target.value)} placeholder="Big Night, Big Morning" />
          <Input
            label="Slug (URL)"
            value={draft.slug}
            onChange={(e) => { setSlugTouched(true); set('slug', bundleSlug(e.target.value)) }}
            disabled={!isNew}
            // The URL is the bundle's identity once it is live: changing it
            // breaks every link anyone has to it.
            hint={isNew ? 'Set once. It cannot be changed after saving.' : 'Fixed — the bundle is already at this address.'}
            placeholder="big-night-big-morning"
          />
          <Input label="Tagline" value={draft.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="Hydrate. Move. Refuel. Reset." />
          <Input label="Series name" value={draft.seriesName} onChange={(e) => set('seriesName', e.target.value)} placeholder="Sunday Reset Sessions" />
        </div>
        <Textarea label="Description" value={draft.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="What it's built for…" />
        <Input label="Honesty line" value={draft.honestyLine} onChange={(e) => set('honestyLine', e.target.value)} placeholder="Not a hangover cure. Just the get-back-on-track stack." />
        <Textarea label="Disclaimer" value={draft.disclaimer} onChange={(e) => set('disclaimer', e.target.value)} rows={2} placeholder="Bundle-specific safety note…" />
        <Select label="Primary goal" value={draft.primaryGoal} onChange={(e) => set('primaryGoal', e.target.value as Goal)}>
          {GOALS.map((g) => <option key={g} value={g}>{g}</option>)}
        </Select>
      </Section>

      {/* Stack builder */}
      <Section title={`Stack — ${draft.cores.length} product${draft.cores.length === 1 ? '' : 's'}`}>
        {draft.cores.map((core, i) => {
          const product = products.find((p) => p.id === core.productId)
          return (
            // `solid`: these stack up and the section scrolls, and translucency
            // over a scrolling parent is the expensive case.
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
                {/* Named, not drawn. These were bare ↑ ↓ ✕ glyphs, which a
                    screen reader reads out as arrows with no idea what moves. */}
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

      {/* Add-ons */}
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

      {/* Workout */}
      <Section title="Workout">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Title" value={draft.workout.title} onChange={(e) => set('workout', { ...draft.workout, title: e.target.value })} placeholder="Full Body Reset" />
          <Input label="Warm-up" value={draft.workout.warmup} onChange={(e) => set('workout', { ...draft.workout, warmup: e.target.value })} placeholder="8–10 min incline walk" />
        </div>
        <Textarea label="Intro" value={draft.workout.intro} onChange={(e) => set('workout', { ...draft.workout, intro: e.target.value })} rows={2} />
        <div>
          <p
            style={{
              fontSize: 'var(--text-micro)',
              fontWeight: 'var(--weight-strong)',
              fontFamily: 'var(--font-display)',
              letterSpacing: 'var(--tracking-eyebrow)',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
            }}
          >
            Exercises
          </p>
          <div className="mt-1 space-y-2">
            {/* Two compact fields and a remove: the row is the record, and a
                stacked label above each would triple its height. */}
            {draft.workout.exercises.map((ex, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  label={`Exercise ${i + 1} name`}
                  compact
                  className="flex-1"
                  value={ex.name}
                  onChange={(e) => set('workout', { ...draft.workout, exercises: draft.workout.exercises.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })}
                  placeholder="Goblet squat"
                />
                <Input
                  label={`Exercise ${i + 1} sets and reps`}
                  compact
                  className="w-28"
                  value={ex.prescription}
                  onChange={(e) => set('workout', { ...draft.workout, exercises: draft.workout.exercises.map((x, j) => j === i ? { ...x, prescription: e.target.value } : x) })}
                  placeholder="3 × 10"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon="trash"
                  aria-label={`Remove exercise ${i + 1}`}
                  onClick={() => set('workout', { ...draft.workout, exercises: draft.workout.exercises.filter((_, j) => j !== i) })}
                />
              </div>
            ))}
            <Button variant="ghost" size="sm" icon="plus" onClick={() => set('workout', { ...draft.workout, exercises: [...draft.workout.exercises, { name: '', prescription: '' }] })}>
              Add exercise
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Finisher" value={draft.workout.finisher} onChange={(e) => set('workout', { ...draft.workout, finisher: e.target.value })} />
          <Input label="Post-workout" value={draft.workout.postWorkout} onChange={(e) => set('workout', { ...draft.workout, postWorkout: e.target.value })} />
        </div>
        <Input label="The rule (intensity)" value={draft.workout.rule} onChange={(e) => set('workout', { ...draft.workout, rule: e.target.value })} placeholder="Leave 2–3 reps in the tank." />
      </Section>

      {/* How to use */}
      <Section title="How to use it">
        {draft.howToUse.map((step, i) => (
          <div key={i} className="flex gap-2">
            <Input
              label={`Step ${i + 1} title`}
              compact
              className="w-40"
              value={step.title}
              onChange={(e) => set('howToUse', draft.howToUse.map((s, j) => j === i ? { ...s, title: e.target.value } : s))}
              placeholder="Step title"
            />
            <Input
              label={`Step ${i + 1} detail`}
              compact
              className="flex-1"
              value={step.detail}
              onChange={(e) => set('howToUse', draft.howToUse.map((s, j) => j === i ? { ...s, detail: e.target.value } : s))}
              placeholder="Detail"
            />
            <Button
              variant="ghost"
              size="sm"
              icon="trash"
              aria-label={`Remove step ${i + 1}`}
              onClick={() => set('howToUse', draft.howToUse.filter((_, j) => j !== i))}
            />
          </div>
        ))}
        <Button variant="ghost" size="sm" icon="plus" onClick={() => set('howToUse', [...draft.howToUse, { title: '', detail: '' }])}>
          Add step
        </Button>
      </Section>

      {/* SEO */}
      <Section title="SEO metadata">
        <Input label="Meta title" value={draft.metaTitle} onChange={(e) => set('metaTitle', e.target.value)} placeholder="Auto from name if blank" />
        <Textarea label="Meta description" value={draft.metaDescription} onChange={(e) => set('metaDescription', e.target.value)} rows={2} placeholder="Auto from description if blank" />
      </Section>

      {/* Readiness checklist */}
      {readiness && (
        <Section title="Readiness">
          <ul className="space-y-1.5">
            {readiness.checks.map((c) => (
              <li key={c.id} className="flex items-center gap-2" style={{ fontSize: 'var(--text-meta)' }}>
                <Badge tone={TONE[c.status]} dot>
                  {c.label}
                </Badge>
                {c.detail && <span style={{ color: 'var(--ink-3)' }}>{c.detail}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Sticky save bar */}
      {/* Solid, not blurred. The blur budget is three surfaces and the shell's
          sticky header already holds one — open the preview and the modal panel
          and its scrim take the other two. A fourth would be over budget, and a
          save bar is the one that can afford to be opaque: nothing needs to be
          read through it. */}
      <div
        className="fixed inset-x-0 bottom-0 z-20"
        style={{
          background: 'var(--surface-solid)',
          borderTop: '1px solid var(--edge)',
          padding: 'var(--space-3) var(--gutter)',
        }}
      >
        <div className="max-w-3xl mx-auto flex items-center justify-end gap-2">
          {/* `loading` rather than a separate disabled flag: one prop blocks the
              press, swaps the glyph and marks it busy, so the error path cannot
              leave a button disabled forever. */}
          <Button variant="secondary" onClick={() => save(false)} disabled={!canSave} loading={saving}>
            Save draft
          </Button>
          <Button
            variant="primary"
            onClick={() => save(true)}
            disabled={!canPublish}
            loading={saving}
            title={canPublish ? undefined : 'Complete the readiness checks first'}
          >
            Publish
          </Button>
        </div>
      </div>

      {/* Product picker */}
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

      {/* Full-page preview overlay */}
      {preview && (
        <Modal onClose={() => setPreview(false)} size="lg" label="Bundle preview">
          <ModalHeader title="Preview" subtitle="Not saved — this is what the page would look like." />
          {/* `padding="none"`: the landing page brings its own layout, and a
              modal's inset around a full page reads as a frame around a frame. */}
          <ModalBody className="p-0">
            <BundleLandingPage bundle={assembled} />
          </ModalBody>
        </Modal>
      )}
    </div>
  )
}

// ── Product picker ─────────────────────────────────────────────────────────────
function ProductPicker({ products, disabledIds, onPick, onClose }: { products: CatalogueProduct[]; disabledIds: Set<string>; onPick: (p: CatalogueProduct) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const filtered = products.filter((p) => p.title.toLowerCase().includes(q.toLowerCase()) || p.category.toLowerCase().includes(q.toLowerCase()))
  return (
    <Modal onClose={onClose} size="md" label="Add a product to this bundle">
      <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--edge)' }}>
        <Input
          label="Search products"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products…"
        />
      </div>
      <ModalBody>
          {filtered.map((p) => {
            const disabled = disabledIds.has(p.id)
            return (
              <Button
                key={p.id}
                variant="ghost"
                fullWidth
                disabled={disabled}
                onClick={() => onPick(p)}
                className="justify-between text-left"
              >
                <span className="min-w-0">
                  <span
                    className="block truncate"
                    style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}
                  >
                    {p.title}
                  </span>
                  <span
                    className="block"
                    style={{
                      fontSize: 'var(--text-meta)',
                      fontWeight: 'var(--weight-body)',
                      color: 'var(--ink-3)',
                    }}
                  >
                    {p.category} · {p.stackSlots[0]}
                  </span>
                </span>
                <span style={{ fontSize: 'var(--text-meta)', color: 'var(--accent)' }}>
                  {disabled ? 'Added' : 'Add'}
                </span>
              </Button>
            )
          })}
        {filtered.length === 0 && (
          <p className="text-center" style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', padding: 'var(--space-8) 0' }}>
            No products match.
          </p>
        )}
      </ModalBody>
    </Modal>
  )
}
