'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { BundleWorkout, ProductBundle } from '@/lib/bundles'
import type { ResolvedBundle } from '@/lib/bundles/resolve'
import { bundleSlug } from '@/lib/bundles/resolve'
import { assembleBundle, bundleToDraft, emptyDraft, EMPTY_WORKOUT, type BundleDraft } from '@/lib/bundles/assemble'
import { blueprintFor } from '@/lib/bundles/resolve'
import { bundleReadiness } from '@/lib/bundles/readiness'
import { calculatePricing, formatGBP } from '@/lib/stack-blueprint/pricing'
import { BundleLandingPage } from '@/components/bundles/BundleLandingPage'
import { Badge, Button, Card, Input, Modal, ModalBody, ModalHeader, Select, Textarea } from '@/components/system'
import { ImageField } from './ImageField'

/** Readiness status → the system's semantic tone. The colours live in `Badge`. */
const TONE = { ok: 'positive', warn: 'attention', fail: 'critical' } as const

interface Props {
  initial: ResolvedBundle | null
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
  const [stacks, setStacks] = useState<ProductBundle[]>([])
  const [slugTouched, setSlugTouched] = useState(!isNew)
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/portal/products')
      .then((r) => r.json())
      .then((d: { products?: { product: CatalogueProduct }[] }) => setProducts((d.products ?? []).map((p) => p.product)))
      .catch(() => setProducts([]))
    // The stacks this package can sell. Products are chosen there, not here.
    fetch('/api/portal/product-bundles')
      .then((r) => r.json())
      .then((d: { bundles?: ProductBundle[] }) => setStacks(d.bundles ?? []))
      .catch(() => setStacks([]))
  }, [])

  const set = <K extends keyof BundleDraft>(key: K, value: BundleDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  /*
    Where an uploaded photo is stored.

    The slug once there is one, and a stable scratch id before that — a new
    stack is named after the picture is chosen as often as before it, and two
    people starting a session stack at once must not write to the same key. The
    record keeps the returned URL either way, so the key never has to be guessed
    again.
  */
  const scratch = useRef(`draft-${Math.random().toString(36).slice(2, 10)}`)
  const imageId = `bundle:${draft.slug || scratch.current}`

  // Auto-slug from the name until the slug is edited directly (new bundles only).
  const onName = (name: string) => setDraft((d) => ({ ...d, name, slug: slugTouched ? d.slug : bundleSlug(name) }))

  /*
    The package, resolved the way the shop would resolve it — its stack read
    from the pre-built bundle it points at, never copied into it. Preview,
    pricing and readiness then run on exactly what a customer would get.
  */
  const stack = useMemo(
    () => stacks.find((s) => s.slug === draft.productBundleSlug) ?? null,
    [stacks, draft.productBundleSlug],
  )
  const assembled = useMemo<ResolvedBundle>(() => {
    const bundle = assembleBundle(draft)
    return {
      ...bundle,
      productBundle: stack,
      blueprint: blueprintFor(bundle, stack),
      addOns: stack?.addOns ?? [],
      displayOrder: initial?.displayOrder ?? 0,
      published: draft.published,
      custom: initial?.custom ?? true,
      removed: false,
    }
  }, [draft, stack, initial])
  const pricing = useMemo(
    () => (products.length && assembled.blueprint.slots.length ? calculatePricing(assembled.blueprint, products) : null),
    [assembled, products],
  )
  const readiness = useMemo(
    () => (products.length ? bundleReadiness(assembled, products) : null),
    [assembled, products],
  )

  const canSave = Boolean(draft.name.trim() && draft.slug.trim())
  const canPublish = canSave && readiness?.sellable && !!draft.tagline.trim() && !!draft.description.trim() && !!draft.disclaimer.trim()

  async function save(publish: boolean) {
    if (!canSave) return
    if (publish && !canPublish) { setError('Fix the readiness checks before publishing.'); return }
    setSaving(true)
    setError(null)
    const bundle = assembleBundle({ ...draft, published: publish })
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
            Session stacks
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
            {isNew ? 'New session stack' : `Edit — ${initial?.name}`}
          </h1>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setPreview(true)} disabled={!stack}>
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
            <span style={{ color: 'var(--ink-3)' }}>Choose a pre-built bundle to price this</span>
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
          {/* The PACKAGE's name — the stack and its workouts together. It is
              what the shop card leads with and what the landing page is
              titled, not the name of the stack or of any one session. */}
          <Input label="Name" value={draft.name} onChange={(e) => onName(e.target.value)} placeholder="Big Night, Big Morning" />
          <Input
            label="Slug (URL)"
            value={draft.slug}
            onChange={(e) => { setSlugTouched(true); set('slug', bundleSlug(e.target.value)) }}
            disabled={!isNew}
            // The URL is the stack's identity once it is live: changing it
            // breaks every link anyone has to it.
            hint={isNew ? 'Set once. It cannot be changed after saving.' : 'Fixed — the session stack is already at this address.'}
            placeholder="big-night-big-morning"
          />
          <Input label="Tagline" value={draft.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="Hydrate. Move. Refuel. Reset." />
          <Input label="Series name" value={draft.seriesName} onChange={(e) => set('seriesName', e.target.value)} placeholder="Sunday Reset Sessions" />
        </div>
        {/*
          The package's photograph — a file or a link.

          A URL alone assumed the picture was already on the internet, which is
          true of a supplier's product shot and false of a photograph somebody
          took of a session. See `ImageField`.
        */}
        <ImageField
          id={imageId}
          label="Photo"
          value={draft.imageUrl}
          onChange={(url) => set('imageUrl', url)}
          hint="Shown on the shop card and at the top of the session stack page. Without one, the card draws the products instead."
        />
        <Textarea label="Description" value={draft.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="What it's built for…" />
        <Input label="Honesty line" value={draft.honestyLine} onChange={(e) => set('honestyLine', e.target.value)} placeholder="Not a hangover cure. Just the get-back-on-track stack." />
        <Textarea label="Disclaimer" value={draft.disclaimer} onChange={(e) => set('disclaimer', e.target.value)} rows={2} placeholder="Safety note for this session stack…" />
      </Section>

      {/*
        The stack this package sells.

        Not a product picker. A session stack is a session plus one of the
        pre-built bundles, so the products are chosen once — over in Pre-built
        bundles — and every package that sells that stack follows it. Copying
        the products in here is what left a product swapped out of "Strength"
        still being sold by four packages.
      */}
      <Section title="Stack">
        {stacks.length === 0 ? (
          <Card tone="attention" padding="tight" className="space-y-2">
            <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>
              There are no pre-built bundles yet.
            </p>
            <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>
              A session stack sells one of them, so build the pre-built bundle first — the products, and why
              they are together. This package can be saved as a draft in the meantime.
            </p>
            <Button variant="secondary" size="sm" onClick={() => router.push('/founderhub/products/prebuilt/new')}>
              Build a pre-built bundle
            </Button>
          </Card>
        ) : (
          <>
            <Select
              label="Pre-built bundle"
              value={draft.productBundleSlug}
              onChange={(e) => set('productBundleSlug', e.target.value)}
              hint="The products, the reasons and the add-ons all come from here."
            >
              <option value="">— none chosen —</option>
              {stacks.map((s) => (
                <option key={s.slug} value={s.slug}>{s.name}</option>
              ))}
            </Select>

            {/* What that choice actually contains, so picking it is not a
                guess from a name in a dropdown. */}
            {stack && (
              <Card solid padding="tight" className="space-y-1">
                {[...stack.blueprint.slots]
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                  .map((slot) => {
                    const product = products.find((p) => p.id === slot.selectedProductId)
                    return (
                      <p
                        key={slot.slotId}
                        className="truncate"
                        style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-2)' }}
                      >
                        <span style={{ color: 'var(--ink-3)' }}>{slot.title}</span>{' '}
                        {product?.title ?? slot.selectedProductId}
                      </p>
                    )
                  })}
                {stack.addOns.length > 0 && (
                  <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>
                    + {stack.addOns.length} optional add-on{stack.addOns.length === 1 ? '' : 's'}
                  </p>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(`/founderhub/products/prebuilt/${stack.slug}`)}
                >
                  Edit this stack
                </Button>
              </Card>
            )}
          </>
        )}
      </Section>

      {/*
        Workouts — one to many.

        A package is a stack AND its sessions, and a week of training is more
        than one session; the editor held exactly one because the session stack
        did. Each session is its own card so the fields of one cannot be mistaken
        for the fields of another, and they are ordered — the landing page leads
        with the first.
      */}
      <Section title={`Workouts — ${draft.workouts.length}`}>
        {draft.workouts.map((workout, w) => {
          /* One updater, so every field below reads the same way and none of
             them can rebuild the array slightly differently. */
          const patch = (next: Partial<BundleWorkout>) =>
            setDraft((d) => ({
              ...d,
              workouts: d.workouts.map((x, j) => (j === w ? { ...x, ...next } : x)),
            }))
          const label = workout.title.trim() || `Workout ${w + 1}`
          return (
            <Card key={w} solid padding="tight" className="space-y-3">
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
                  {label}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="chevron-up"
                    aria-label={`Move ${label} up`}
                    disabled={w === 0}
                    onClick={() => setDraft((d) => { const x = [...d.workouts]; if (w > 0) [x[w - 1], x[w]] = [x[w], x[w - 1]]; return { ...d, workouts: x } })}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="chevron-down"
                    aria-label={`Move ${label} down`}
                    disabled={w === draft.workouts.length - 1}
                    onClick={() => setDraft((d) => { const x = [...d.workouts]; if (w < x.length - 1) [x[w + 1], x[w]] = [x[w], x[w + 1]]; return { ...d, workouts: x } })}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="trash"
                    aria-label={`Remove ${label}`}
                    onClick={() => setDraft((d) => ({ ...d, workouts: d.workouts.filter((_, j) => j !== w) }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label={`${label} — title`} value={workout.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Full Body Reset" />
                <Input label={`${label} — warm-up`} value={workout.warmup} onChange={(e) => patch({ warmup: e.target.value })} placeholder="8–10 min incline walk" />
              </div>
              <Textarea label={`${label} — intro`} value={workout.intro} onChange={(e) => patch({ intro: e.target.value })} rows={2} />
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
                  {workout.exercises.map((ex, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        label={`${label} — exercise ${i + 1} name`}
                        compact
                        className="flex-1"
                        value={ex.name}
                        onChange={(e) => patch({ exercises: workout.exercises.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })}
                        placeholder="Goblet squat"
                      />
                      <Input
                        label={`${label} — exercise ${i + 1} sets and reps`}
                        compact
                        className="w-28"
                        value={ex.prescription}
                        onChange={(e) => patch({ exercises: workout.exercises.map((x, j) => j === i ? { ...x, prescription: e.target.value } : x) })}
                        placeholder="3 × 10"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="trash"
                        aria-label={`Remove ${label} exercise ${i + 1}`}
                        onClick={() => patch({ exercises: workout.exercises.filter((_, j) => j !== i) })}
                      />
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" icon="plus" onClick={() => patch({ exercises: [...workout.exercises, { name: '', prescription: '' }] })}>
                    Add exercise
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label={`${label} — finisher`} value={workout.finisher} onChange={(e) => patch({ finisher: e.target.value })} />
                <Input label={`${label} — post-workout`} value={workout.postWorkout} onChange={(e) => patch({ postWorkout: e.target.value })} />
              </div>
              <Input label={`${label} — the rule (intensity)`} value={workout.rule} onChange={(e) => patch({ rule: e.target.value })} placeholder="Leave 2–3 reps in the tank." />
            </Card>
          )
        })}
        <Button
          variant="secondary"
          size="sm"
          icon="plus"
          fullWidth
          onClick={() => setDraft((d) => ({ ...d, workouts: [...d.workouts, { ...EMPTY_WORKOUT, exercises: [{ name: '', prescription: '' }] }] }))}
        >
          Add workout
        </Button>
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

      {/* Full-page preview overlay */}
      {preview && (
        <Modal onClose={() => setPreview(false)} size="lg" label="Session stack preview">
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
