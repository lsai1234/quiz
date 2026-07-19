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

const DOT: Record<'ok' | 'warn' | 'fail', string> = { ok: '#34d399', warn: '#fbbf24', fail: '#f87171' }
const GOALS: Goal[] = ['muscle', 'energy', 'performance', 'hydration', 'recovery', 'health', 'cutting', 'bulking', 'sleep-better', 'less-stress', 'focus', 'immune', 'skin-hair-nails', 'menopause', 'gut-health']

interface Props {
  initial: PrebuiltBundle | null
  isNew: boolean
}

// ── Small styled primitives ───────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-display)' }}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
const inputCls = 'w-full px-3 py-2 rounded-xl text-sm outline-none'
const inputStyle = { background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' } as const

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
      <h2 className="text-sm font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>{title}</h2>
      {children}
    </section>
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
      router.push('/portal/bundles')
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
          <button onClick={() => router.push('/portal/bundles')} className="text-[11px] font-semibold text-[var(--color-muted)] mb-1">← Bundles</button>
          <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            {isNew ? 'New bundle' : `Edit — ${initial?.name}`}
          </h1>
        </div>
        <button
          onClick={() => setPreview(true)}
          disabled={draft.cores.length === 0}
          className="text-xs font-bold px-3 py-2 rounded-xl disabled:opacity-40"
          style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-display)' }}
        >
          Preview
        </button>
      </div>

      {error && <div className="rounded-xl border border-[var(--color-red)]/30 bg-[var(--color-red)]/8 px-4 py-2.5 text-xs text-[var(--color-red)]">{error}</div>}

      {/* Live readiness + price */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 text-xs">
          {pricing ? (
            <>
              <span className="font-black" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>{formatGBP(pricing.oneOffTotal)}</span>
              <span className="text-[var(--color-muted)]">one-off · {pricing.subscriptionMinOrderMet ? `${formatGBP(pricing.subscriptionTotal)}/mo` : 'no monthly'}</span>
            </>
          ) : <span className="text-[var(--color-muted)]">Add a product to price the bundle</span>}
        </div>
        {readiness && (
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: DOT[readiness.overall] }} />
            <span className="text-[11px] font-bold text-[var(--color-text-2)]">{readiness.sellable ? 'Sellable' : 'Not sellable'}</span>
          </div>
        )}
      </div>

      {/* Identity & story */}
      <Section title="Identity & story">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name"><input value={draft.name} onChange={(e) => onName(e.target.value)} className={inputCls} style={inputStyle} placeholder="Big Night, Big Morning" /></Field>
          <Field label="Slug (URL)"><input value={draft.slug} onChange={(e) => { setSlugTouched(true); set('slug', bundleSlug(e.target.value)) }} disabled={!isNew} className={inputCls} style={{ ...inputStyle, opacity: isNew ? 1 : 0.6 }} placeholder="big-night-big-morning" /></Field>
          <Field label="Tagline"><input value={draft.tagline} onChange={(e) => set('tagline', e.target.value)} className={inputCls} style={inputStyle} placeholder="Hydrate. Move. Refuel. Reset." /></Field>
          <Field label="Series name"><input value={draft.seriesName} onChange={(e) => set('seriesName', e.target.value)} className={inputCls} style={inputStyle} placeholder="Sunday Reset Sessions" /></Field>
        </div>
        <Field label="Description"><textarea value={draft.description} onChange={(e) => set('description', e.target.value)} rows={3} className={inputCls} style={inputStyle} placeholder="What it's built for…" /></Field>
        <Field label="Honesty line"><input value={draft.honestyLine} onChange={(e) => set('honestyLine', e.target.value)} className={inputCls} style={inputStyle} placeholder="Not a hangover cure. Just the get-back-on-track stack." /></Field>
        <Field label="Disclaimer"><textarea value={draft.disclaimer} onChange={(e) => set('disclaimer', e.target.value)} rows={2} className={inputCls} style={inputStyle} placeholder="Bundle-specific safety note…" /></Field>
        <Field label="Primary goal">
          <select value={draft.primaryGoal} onChange={(e) => set('primaryGoal', e.target.value as Goal)} className={inputCls} style={inputStyle}>
            {GOALS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>
      </Section>

      {/* Stack builder */}
      <Section title={`Stack — ${draft.cores.length} product${draft.cores.length === 1 ? '' : 's'}`}>
        {draft.cores.map((core, i) => {
          const product = products.find((p) => p.id === core.productId)
          return (
            <div key={core.productId} className="rounded-xl border border-[var(--color-border)] p-3 space-y-2" style={{ background: 'var(--color-surface-2)' }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-[var(--color-text)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{product?.title ?? core.productId}</p>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => setDraft((d) => { const c = [...d.cores]; if (i > 0) [c[i - 1], c[i]] = [c[i], c[i - 1]]; return { ...d, cores: c } })} disabled={i === 0} className="w-6 h-6 rounded text-xs disabled:opacity-30" style={inputStyle}>↑</button>
                  <button onClick={() => setDraft((d) => { const c = [...d.cores]; if (i < c.length - 1) [c[i + 1], c[i]] = [c[i], c[i + 1]]; return { ...d, cores: c } })} disabled={i === draft.cores.length - 1} className="w-6 h-6 rounded text-xs disabled:opacity-30" style={inputStyle}>↓</button>
                  <button onClick={() => setDraft((d) => ({ ...d, cores: d.cores.filter((_, j) => j !== i) }))} className="w-6 h-6 rounded text-xs" style={{ ...inputStyle, color: 'var(--color-red)' }}>✕</button>
                </div>
              </div>
              <input value={core.title} onChange={(e) => setDraft((d) => { const c = [...d.cores]; c[i] = { ...c[i], title: e.target.value }; return { ...d, cores: c } })} className={inputCls} style={inputStyle} placeholder="Slot label, e.g. Hydration" />
              <textarea value={core.reason} onChange={(e) => setDraft((d) => { const c = [...d.cores]; c[i] = { ...c[i], reason: e.target.value }; return { ...d, cores: c } })} rows={2} className={inputCls} style={inputStyle} placeholder="Why it's in the stack (claim-safe)…" />
            </div>
          )
        })}
        <button onClick={() => setPicker('core')} className="w-full py-2.5 rounded-xl text-xs font-bold" style={{ background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', color: 'var(--color-accent)', border: '1px dashed color-mix(in srgb, var(--color-accent) 40%, transparent)', fontFamily: 'var(--font-display)' }}>+ Add product</button>
      </Section>

      {/* Add-ons */}
      <Section title={`Optional add-ons — ${draft.addOns.length}`}>
        {draft.addOns.map((addon, i) => {
          const product = products.find((p) => p.id === addon.productId)
          return (
            <div key={addon.productId} className="rounded-xl border border-[var(--color-border)] p-3 space-y-2" style={{ background: 'var(--color-surface-2)' }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-[var(--color-text)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{product?.title ?? addon.productId}</p>
                <button onClick={() => setDraft((d) => ({ ...d, addOns: d.addOns.filter((_, j) => j !== i) }))} className="w-6 h-6 rounded text-xs flex-shrink-0" style={{ ...inputStyle, color: 'var(--color-red)' }}>✕</button>
              </div>
              <input value={addon.title} onChange={(e) => setDraft((d) => { const a = [...d.addOns]; a[i] = { ...a[i], title: e.target.value }; return { ...d, addOns: a } })} className={inputCls} style={inputStyle} placeholder="Add-on label, e.g. Evening Reset" />
              <textarea value={addon.reason} onChange={(e) => setDraft((d) => { const a = [...d.addOns]; a[i] = { ...a[i], reason: e.target.value }; return { ...d, addOns: a } })} rows={2} className={inputCls} style={inputStyle} placeholder="Why someone might add it…" />
            </div>
          )
        })}
        <button onClick={() => setPicker('addon')} className="w-full py-2.5 rounded-xl text-xs font-bold" style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-2)', border: '1px dashed var(--color-border-2)', fontFamily: 'var(--font-display)' }}>+ Add optional product</button>
      </Section>

      {/* Workout */}
      <Section title="Workout">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Title"><input value={draft.workout.title} onChange={(e) => set('workout', { ...draft.workout, title: e.target.value })} className={inputCls} style={inputStyle} placeholder="Full Body Reset" /></Field>
          <Field label="Warm-up"><input value={draft.workout.warmup} onChange={(e) => set('workout', { ...draft.workout, warmup: e.target.value })} className={inputCls} style={inputStyle} placeholder="8–10 min incline walk" /></Field>
        </div>
        <Field label="Intro"><textarea value={draft.workout.intro} onChange={(e) => set('workout', { ...draft.workout, intro: e.target.value })} rows={2} className={inputCls} style={inputStyle} /></Field>
        <div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-display)' }}>Exercises</span>
          <div className="mt-1 space-y-2">
            {draft.workout.exercises.map((ex, i) => (
              <div key={i} className="flex gap-2">
                <input value={ex.name} onChange={(e) => set('workout', { ...draft.workout, exercises: draft.workout.exercises.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} className={inputCls} style={inputStyle} placeholder="Goblet squat" />
                <input value={ex.prescription} onChange={(e) => set('workout', { ...draft.workout, exercises: draft.workout.exercises.map((x, j) => j === i ? { ...x, prescription: e.target.value } : x) })} className="w-28 px-3 py-2 rounded-xl text-sm outline-none flex-shrink-0" style={inputStyle} placeholder="3 × 10" />
                <button onClick={() => set('workout', { ...draft.workout, exercises: draft.workout.exercises.filter((_, j) => j !== i) })} className="w-9 rounded-xl text-xs flex-shrink-0" style={{ ...inputStyle, color: 'var(--color-red)' }}>✕</button>
              </div>
            ))}
            <button onClick={() => set('workout', { ...draft.workout, exercises: [...draft.workout.exercises, { name: '', prescription: '' }] })} className="text-[11px] font-bold text-[var(--color-accent)]">+ Add exercise</button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Finisher"><input value={draft.workout.finisher} onChange={(e) => set('workout', { ...draft.workout, finisher: e.target.value })} className={inputCls} style={inputStyle} /></Field>
          <Field label="Post-workout"><input value={draft.workout.postWorkout} onChange={(e) => set('workout', { ...draft.workout, postWorkout: e.target.value })} className={inputCls} style={inputStyle} /></Field>
        </div>
        <Field label="The rule (intensity)"><input value={draft.workout.rule} onChange={(e) => set('workout', { ...draft.workout, rule: e.target.value })} className={inputCls} style={inputStyle} placeholder="Leave 2–3 reps in the tank." /></Field>
      </Section>

      {/* How to use */}
      <Section title="How to use it">
        {draft.howToUse.map((step, i) => (
          <div key={i} className="flex gap-2">
            <input value={step.title} onChange={(e) => set('howToUse', draft.howToUse.map((s, j) => j === i ? { ...s, title: e.target.value } : s))} className="w-40 px-3 py-2 rounded-xl text-sm outline-none flex-shrink-0" style={inputStyle} placeholder="Step title" />
            <input value={step.detail} onChange={(e) => set('howToUse', draft.howToUse.map((s, j) => j === i ? { ...s, detail: e.target.value } : s))} className={inputCls} style={inputStyle} placeholder="Detail" />
            <button onClick={() => set('howToUse', draft.howToUse.filter((_, j) => j !== i))} className="w-9 rounded-xl text-xs flex-shrink-0" style={{ ...inputStyle, color: 'var(--color-red)' }}>✕</button>
          </div>
        ))}
        <button onClick={() => set('howToUse', [...draft.howToUse, { title: '', detail: '' }])} className="text-[11px] font-bold text-[var(--color-accent)]">+ Add step</button>
      </Section>

      {/* SEO */}
      <Section title="SEO metadata">
        <Field label="Meta title"><input value={draft.metaTitle} onChange={(e) => set('metaTitle', e.target.value)} className={inputCls} style={inputStyle} placeholder="Auto from name if blank" /></Field>
        <Field label="Meta description"><textarea value={draft.metaDescription} onChange={(e) => set('metaDescription', e.target.value)} rows={2} className={inputCls} style={inputStyle} placeholder="Auto from description if blank" /></Field>
      </Section>

      {/* Readiness checklist */}
      {readiness && (
        <Section title="Readiness">
          <div className="space-y-1.5">
            {readiness.checks.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-[11px]">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: DOT[c.status] }} />
                <span className="text-[var(--color-text-2)] font-semibold">{c.label}</span>
                {c.detail && <span className="text-[var(--color-muted)]">— {c.detail}</span>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-border)] px-5 py-3" style={{ background: 'var(--color-surface)' }}>
        <div className="max-w-3xl mx-auto flex items-center justify-end gap-2">
          <button onClick={() => save(false)} disabled={!canSave || saving} className="text-xs font-bold px-4 py-2.5 rounded-xl disabled:opacity-40" style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-display)' }}>
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button onClick={() => save(true)} disabled={!canPublish || saving} className="text-xs font-bold px-4 py-2.5 rounded-xl disabled:opacity-40" style={{ background: 'var(--color-accent)', color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }} title={canPublish ? '' : 'Complete the readiness checks first'}>
            {saving ? 'Saving…' : 'Publish'}
          </button>
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
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--color-bg)' }}>
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]" style={{ background: 'var(--color-surface)' }}>
            <span className="text-xs font-bold text-[var(--color-muted)]">Preview — not saved</span>
            <button onClick={() => setPreview(false)} className="text-xs font-bold px-3 py-1.5 rounded-xl" style={{ background: 'var(--color-accent)', color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}>Close preview</button>
          </div>
          <BundleLandingPage bundle={assembled} />
        </div>
      )}
    </div>
  )
}

// ── Product picker ─────────────────────────────────────────────────────────────
function ProductPicker({ products, disabledIds, onPick, onClose }: { products: CatalogueProduct[]; disabledIds: Set<string>; onPick: (p: CatalogueProduct) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const filtered = products.filter((p) => p.title.toLowerCase().includes(q.toLowerCase()) || p.category.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-lg max-h-[80vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-[var(--color-border)]">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className={inputCls} style={inputStyle} />
        </div>
        <div className="overflow-y-auto p-2">
          {filtered.map((p) => {
            const disabled = disabledIds.has(p.id)
            return (
              <button key={p.id} onClick={() => !disabled && onPick(p)} disabled={disabled} className="w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 disabled:opacity-40" style={{ background: 'transparent' }}>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--color-text)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{p.title}</p>
                  <p className="text-[11px] text-[var(--color-muted)]">{p.category} · {p.stackSlots[0]}</p>
                </div>
                <span className="text-[11px] font-bold text-[var(--color-accent)] flex-shrink-0">{disabled ? 'Added' : 'Add +'}</span>
              </button>
            )
          })}
          {filtered.length === 0 && <p className="text-sm text-[var(--color-muted)] text-center py-8">No products match.</p>}
        </div>
      </div>
    </div>
  )
}
