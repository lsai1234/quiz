'use client'

import { useEffect, useMemo, useState } from 'react'
import { buildStackBlueprint } from '@/lib/stack-blueprint/factory'
import { calculatePricing, formatGBP, type PricingConfig, type DiscountTier } from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers } from '@/lib/types'

const ACCENT = '#00D4FF'

const SAMPLES: { name: string; answers: QuizAnswers }[] = [
  { name: 'Performance', answers: { goals: ['muscle', 'energy'], trainingFrequency: '3-4x', budget: '50-80', track: 'performance' } as unknown as QuizAnswers },
  { name: 'Wellbeing', answers: { goals: ['sleep-better', 'less-stress'], trainingFrequency: '1-2x', budget: '30-50', track: 'wellbeing' } as unknown as QuizAnswers },
  { name: 'Budget', answers: { goals: ['health'], trainingFrequency: '1-2x', budget: 'under-30', track: 'wellbeing' } as unknown as QuizAnswers },
]

function pct(n: number) { return Math.round(n * 1000) / 10 }

export default function PricingPage() {
  const [draft, setDraft] = useState<PricingConfig | null>(null)
  const [catalogue, setCatalogue] = useState<CatalogueProduct[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/portal/pricing').then((r) => r.json()).then((d) => setDraft(d.current)).catch(() => {})
    fetch('/api/catalogue').then((r) => r.json()).then((d) => setCatalogue(d.products ?? [])).catch(() => {})
  }, [])

  const previews = useMemo(() => {
    if (!draft || catalogue.length === 0) return []
    return SAMPLES.map((s) => {
      const bp = buildStackBlueprint(s.answers, catalogue)
      const p = calculatePricing(bp, catalogue, s.answers, draft)
      return { name: s.name, p }
    })
  }, [draft, catalogue])

  if (!draft) return <p className="text-sm text-[var(--color-muted)]">Loading…</p>

  const set = (patch: Partial<PricingConfig>) => { setDraft({ ...draft, ...patch }); setSaved(false) }
  const setTier = (i: number, patch: Partial<DiscountTier>) => {
    const bundleTiers = draft.bundleTiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t))
    set({ bundleTiers })
  }
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
    const d = await r.json(); setDraft(d.current); setSaving(false); setSaved(true)
  }

  const Num = ({ label, value, onChange, step = 1, suffix }: { label: string; value: number; onChange: (n: number) => void; step?: number; suffix?: string }) => (
    <label className="flex items-center justify-between gap-3 py-2">
      <span className="text-xs text-[var(--color-text-2)]">{label}</span>
      <span className="flex items-center gap-1">
        <input type="number" step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-24 px-2 py-1.5 rounded-lg text-sm text-right outline-none"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
        {suffix && <span className="text-[11px] text-[var(--color-muted)] w-6">{suffix}</span>}
      </span>
    </label>
  )

  return (
    <div className="pb-10">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Pricing rules</h1>
        <div className="flex gap-2">
          <button onClick={reset} disabled={saving} className="text-xs font-semibold px-3 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-muted)]">Reset</button>
          <button onClick={save} disabled={saving} className="text-xs font-bold px-4 py-2 rounded-xl bg-[var(--color-accent)] text-[var(--color-bg)]" style={{ fontFamily: 'var(--font-display)' }}>{saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}</button>
        </div>
      </div>

      {/* Profit preview */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 mb-5">
        <p className="text-[10px] font-bold tracking-widest uppercase mb-3" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>Profit preview</p>
        <div className="space-y-2.5">
          {previews.map((pv) => (
            <div key={pv.name} className="text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[var(--color-text)]">{pv.name}</span>
                <span className={pv.p.subscriptionProfitableOnCancel ? '' : 'text-[var(--color-red)] font-bold'} style={{ color: pv.p.subscriptionProfitableOnCancel ? '#34d399' : undefined }}>
                  {pv.p.subscriptionProfitableOnCancel ? 'Profitable on cancel ✓' : 'Loses money on cancel ✗'}
                </span>
              </div>
              <p className="text-[var(--color-muted)] mt-0.5">
                One-off {formatGBP(pv.p.oneOffTotal)} ({pv.p.oneOffMarginPct}% margin) · Sub {formatGBP(pv.p.subscriptionTotal)}/mo · 1st month {formatGBP(pv.p.subscriptionFirstMonth)} · {pv.p.subscriptionMinMonths}mo min ({formatGBP(pv.p.subscriptionMinTermTotal)})
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Subscription + guardrails */}
      <Section title="Subscription & guardrails">
        <Num label="Subscribe & save discount" value={pct(draft.subscriptionDiscount)} suffix="%" onChange={(n) => set({ subscriptionDiscount: n / 100 })} />
        <Num label="First-month intro discount" value={pct(draft.introOffer.firstMonthDiscount)} suffix="%" onChange={(n) => set({ introOffer: { ...draft.introOffer, firstMonthDiscount: n / 100 } })} />
        <Num label="Minimum term" value={draft.minSubscriptionMonths} suffix="mo" onChange={(n) => set({ minSubscriptionMonths: n })} />
        <Num label="Min monthly to subscribe" value={draft.minSubscriptionMonthly} suffix="£" onChange={(n) => set({ minSubscriptionMonthly: n })} />
        <Num label="Margin floor" value={pct(draft.marginFloorPct)} suffix="%" onChange={(n) => set({ marginFloorPct: n / 100 })} />
        <Num label="Default cost ratio" value={pct(draft.defaultCostRatio)} suffix="%" onChange={(n) => set({ defaultCostRatio: n / 100 })} />
        <Num label="Max delivery interval" value={draft.maxDeliveryMonths} suffix="mo" onChange={(n) => set({ maxDeliveryMonths: n })} />
      </Section>

      {/* Bundle tiers */}
      <Section title="One-off bundle tiers">
        <div className="space-y-2">
          {draft.bundleTiers.map((t, i) => (
            <div key={t.id} className="flex items-center gap-2">
              <input value={t.label} onChange={(e) => setTier(i, { label: e.target.value })} className="flex-1 px-2 py-1.5 rounded-lg text-xs outline-none" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
              <span className="text-[11px] text-[var(--color-muted)]">£≥</span>
              <input type="number" value={t.minSubtotal ?? 0} onChange={(e) => setTier(i, { minSubtotal: parseFloat(e.target.value) })} className="w-16 px-2 py-1.5 rounded-lg text-xs text-right outline-none" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
              <input type="number" value={pct(t.discountPct)} onChange={(e) => setTier(i, { discountPct: parseFloat(e.target.value) / 100 })} className="w-14 px-2 py-1.5 rounded-lg text-xs text-right outline-none" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
              <span className="text-[11px] text-[var(--color-muted)]">%</span>
              <button onClick={() => removeTier(i)} className="text-[var(--color-muted)] text-sm px-1">✕</button>
            </div>
          ))}
          <button onClick={addTier} className="text-xs font-bold mt-1" style={{ color: ACCENT }}>+ Add tier</button>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 mb-4">
      <p className="text-sm font-bold mb-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>{title}</p>
      {children}
    </div>
  )
}
