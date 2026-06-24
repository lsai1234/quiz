'use client'

import { useEffect, useMemo, useState } from 'react'
import { buildStackBlueprint } from '@/lib/stack-blueprint/factory'
import { calculatePricing, formatGBP, type PricingConfig, type DiscountTier } from '@/lib/stack-blueprint/pricing'
import type { StackBlueprint } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers } from '@/lib/types'
import { defaultAnswers } from '@/lib/store'

const ACCENT = '#00D4FF'
const GREEN = '#34d399'
const RED = '#f87171'

const sample = (over: Partial<QuizAnswers>): QuizAnswers => ({ ...defaultAnswers, ...over })
const SAMPLES: { name: string; answers: QuizAnswers }[] = [
  { name: 'Performance stack', answers: sample({ goals: ['muscle', 'energy'], trainingFrequency: '3-4x', budget: '50-80', track: 'performance' }) },
  { name: 'Wellbeing stack', answers: sample({ goals: ['sleep-better', 'less-stress'], trainingFrequency: '1-2x', budget: '30-50', track: 'wellbeing' }) },
]

function pct(n: number) { return Math.round(n * 1000) / 10 }

// A one-product subscription, so we can check each product's profitability in isolation.
function single(p: CatalogueProduct): StackBlueprint {
  const v = p.variants.find((x) => x.available) ?? p.variants[0]
  return {
    id: 'preview', stackName: '', summary: '', primaryGoal: p.goals[0] ?? 'health', secondaryGoals: [], userProfileSummary: '',
    slots: [{ slotId: 's', slotType: p.stackSlots[0] ?? 'health', title: '', description: '', recommendedProductId: p.id, selectedProductId: p.id, selectedVariantId: v?.id ?? null, required: true, canRemove: false, canSwap: true, swapGroup: p.swapGroup, reason: '', confidenceScore: 80, displayOrder: 0 }],
    estimatedOneOffPrice: 0, estimatedSubscriptionPrice: 0, savingsSummary: '', createdAt: '',
  }
}

export default function PricingPage() {
  const [draft, setDraft] = useState<PricingConfig | null>(null)
  const [catalogue, setCatalogue] = useState<CatalogueProduct[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/portal/pricing').then((r) => r.json()).then((d) => setDraft(d.current)).catch(() => {})
    fetch('/api/catalogue').then((r) => r.json()).then((d) => setCatalogue(d.products ?? [])).catch(() => {})
  }, [])

  // Rigorous profitability: check EVERY subscribable product on its own. If each
  // one profits even on the earliest cancel, then any bundle of them does too.
  const profit = useMemo(() => {
    if (!draft || catalogue.length === 0) return null
    const subs = catalogue.filter((p) => p.subscriptionEligible && !p.isSubscriptionOnly)
    const offenders: string[] = []
    for (const p of subs) {
      try {
        if (!calculatePricing(single(p), [p], undefined, draft).subscriptionProfitableOnCancel) offenders.push(p.title)
      } catch { /* skip */ }
    }
    return { total: subs.length, offenders }
  }, [draft, catalogue])

  const examples = useMemo(() => {
    if (!draft || catalogue.length === 0) return []
    return SAMPLES.flatMap((s) => {
      try {
        return [{ name: s.name, p: calculatePricing(buildStackBlueprint(s.answers, catalogue), catalogue, s.answers, draft) }]
      } catch { return [] }
    })
  }, [draft, catalogue])

  if (!draft) return <p className="text-sm text-[var(--color-muted)]">Loading…</p>

  const set = (patch: Partial<PricingConfig>) => { setDraft({ ...draft, ...patch }); setSaved(false) }
  const setTier = (i: number, patch: Partial<DiscountTier>) => set({ bundleTiers: draft.bundleTiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) })
  const addTier = () => set({ bundleTiers: [...draft.bundleTiers, { id: `tier-${Date.now()}`, label: 'New tier', minSubtotal: 0, discountPct: 0.05 }] })
  const removeTier = (i: number) => set({ bundleTiers: draft.bundleTiers.filter((_, idx) => idx !== i) })

  async function save() {
    setSaving(true)
    await fetch('/api/portal/pricing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ overrides: draft }) })
    setSaving(false); setSaved(true)
  }
  async function reset() {
    setSaving(true)
    const r = await fetch('/api/portal/pricing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reset: true }) })
    setDraft((await r.json()).current); setSaving(false); setSaved(true)
  }

  const safe = profit && profit.offenders.length === 0

  return (
    <div className="pb-10">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Pricing</h1>
        <div className="flex gap-2">
          <button onClick={reset} disabled={saving} className="text-xs font-semibold px-3 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-muted)]">Reset</button>
          <button onClick={save} disabled={saving} className="text-xs font-bold px-4 py-2 rounded-xl bg-[var(--color-accent)] text-[var(--color-bg)]" style={{ fontFamily: 'var(--font-display)' }}>{saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}</button>
        </div>
      </div>
      <p className="text-sm text-[var(--color-muted)] mb-5">Set the discounts and rules. The check below confirms you still make money on every product.</p>

      {/* Profitability — the headline */}
      {profit && (
        <div className="rounded-2xl border p-5 mb-4" style={{ background: `color-mix(in srgb, ${safe ? GREEN : RED} 7%, transparent)`, borderColor: `color-mix(in srgb, ${safe ? GREEN : RED} 35%, transparent)` }}>
          <p className="text-sm font-black mb-1" style={{ color: safe ? GREEN : RED, fontFamily: 'var(--font-display)' }}>
            {safe ? '✓ Every product stays profitable' : `✗ ${profit.offenders.length} product${profit.offenders.length === 1 ? '' : 's'} would lose money`}
          </p>
          <p className="text-xs leading-relaxed text-[var(--color-text-2)]">
            {safe
              ? `All ${profit.total} subscribable products make a profit even if a customer cancels the moment their minimum term ends. Because every product is profitable on its own, any bundle of them is profitable too.`
              : 'These lose money if a customer takes the intro offer and cancels at the earliest point — raise the minimum term, lower the first-month offer, or set accurate costs:'}
          </p>
          {!safe && (
            <ul className="mt-2 space-y-0.5">
              {profit.offenders.map((t) => <li key={t} className="text-xs font-semibold" style={{ color: RED }}>• {t}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Example prices */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 mb-5">
        <p className="text-[10px] font-bold tracking-widest uppercase mb-2 text-[var(--color-muted)]">What customers would pay</p>
        <div className="space-y-2">
          {examples.map((e) => (
            <div key={e.name} className="text-xs flex items-baseline justify-between gap-2">
              <span className="font-bold text-[var(--color-text)]">{e.name}</span>
              <span className="text-[var(--color-text-2)] text-right">
                <strong style={{ color: ACCENT }}>{formatGBP(e.p.subscriptionTotal)}/mo</strong> on subscription (1st month {formatGBP(e.p.subscriptionFirstMonth)}) · {formatGBP(e.p.oneOffTotal)} one-off
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Subscription offer */}
      <Section title="Subscription offer" desc="What customers get for subscribing.">
        <Num label="Subscribe & save" value={pct(draft.subscriptionDiscount)} suffix="%" help="Ongoing discount vs buying once-off, for being on a plan." onChange={(n) => set({ subscriptionDiscount: n / 100 })} />
        <Num label="First-month offer" value={pct(draft.introOffer.firstMonthDiscount)} suffix="%" help="Extra discount on the first month only, to get people to start." onChange={(n) => set({ introOffer: { ...draft.introOffer, firstMonthDiscount: n / 100 } })} />
        <Num label="Minimum commitment" value={draft.minSubscriptionMonths} suffix="mo" help="Months a customer must stay before they can cancel or pause." onChange={(n) => set({ minSubscriptionMonths: n })} />
        <Num label="Minimum to subscribe" value={draft.minSubscriptionMonthly} suffix="£/mo" help="Smallest monthly value we’ll start a subscription for." onChange={(n) => set({ minSubscriptionMonthly: n })} />
      </Section>

      {/* Profit guardrails */}
      <Section title="Profit guardrails" desc="Safety limits so discounts never lose money.">
        <Num label="Never sell below this profit" value={pct(draft.marginFloorPct)} suffix="%" help="A product is never discounted below this profit margin over its cost." onChange={(n) => set({ marginFloorPct: n / 100 })} />
        <Num label="Assumed cost (if not set)" value={pct(draft.defaultCostRatio)} suffix="%" help="When a product has no cost entered, assume it costs this share of its price." onChange={(n) => set({ defaultCostRatio: n / 100 })} />
        <Num label="Longest gap between deliveries" value={draft.maxDeliveryMonths} suffix="mo" help="We’ll never wait longer than this to ship a product." onChange={(n) => set({ maxDeliveryMonths: n })} />
      </Section>

      {/* Bundle tiers */}
      <Section title="One-off bundle discounts" desc="Spend more in a single order, save more. The best-qualifying tier applies.">
        <div className="space-y-2">
          {draft.bundleTiers.map((t, i) => (
            <div key={t.id} className="flex items-center gap-2">
              <input value={t.label} onChange={(e) => setTier(i, { label: e.target.value })} className="flex-1 min-w-0 px-2 py-1.5 rounded-lg text-xs outline-none" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
              <span className="text-[11px] text-[var(--color-muted)]">spend £</span>
              <input type="number" value={t.minSubtotal ?? 0} onChange={(e) => setTier(i, { minSubtotal: parseFloat(e.target.value) })} className="w-14 px-2 py-1.5 rounded-lg text-xs text-right outline-none" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
              <input type="number" value={pct(t.discountPct)} onChange={(e) => setTier(i, { discountPct: parseFloat(e.target.value) / 100 })} className="w-12 px-2 py-1.5 rounded-lg text-xs text-right outline-none" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
              <span className="text-[11px] text-[var(--color-muted)]">% off</span>
              <button onClick={() => removeTier(i)} className="text-[var(--color-muted)] text-sm px-1">✕</button>
            </div>
          ))}
          <button onClick={addTier} className="text-xs font-bold mt-1" style={{ color: ACCENT }}>+ Add a tier</button>
        </div>
      </Section>
    </div>
  )
}

function Num({ label, value, onChange, suffix, help }: { label: string; value: number; onChange: (n: number) => void; suffix?: string; help?: string }) {
  return (
    <div className="py-2.5 border-b border-[var(--color-border)] last:border-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-[var(--color-text)]">{label}</span>
        <span className="flex items-center gap-1 flex-shrink-0">
          <input type="number" value={value} onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-20 px-2 py-1.5 rounded-lg text-sm text-right outline-none"
            style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
          {suffix && <span className="text-[11px] text-[var(--color-muted)] w-10">{suffix}</span>}
        </span>
      </div>
      {help && <p className="text-[11px] text-[var(--color-muted)] mt-1 leading-snug pr-24">{help}</p>}
    </div>
  )
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 mb-4">
      <p className="text-sm font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>{title}</p>
      {desc && <p className="text-[11px] text-[var(--color-muted)] mb-2 mt-0.5">{desc}</p>}
      <div className="mt-1">{children}</div>
    </div>
  )
}
