'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { STACK_SLOTS, SLOT_LABELS, type StackSlot } from '@/lib/catalogue/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'

const ACCENT = '#00D4FF'
const GOALS = ['muscle', 'energy', 'performance', 'hydration', 'recovery', 'health', 'cutting', 'bulking', 'sleep-better', 'less-stress', 'focus', 'immune', 'skin-hair-nails', 'menopause', 'gut-health']

interface Props {
  product: CatalogueProduct
  allProducts: CatalogueProduct[]
  onClose: () => void
  onSaved: () => void
}

export function ProductEditor({ product, allProducts, onClose, onSaved }: Props) {
  const [d, setD] = useState<CatalogueProduct>({ ...product, consumption: product.consumption ? { ...product.consumption } : undefined })
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const set = (patch: Partial<CatalogueProduct>) => setD((p) => ({ ...p, ...patch }))
  const toggleIn = <T,>(arr: T[], v: T): T[] => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  async function save() {
    setSaving(true)
    const patch: Partial<CatalogueProduct> = {
      stackSlots: d.stackSlots, goals: d.goals, dietaryTags: d.dietaryTags, swapGroup: d.swapGroup, category: d.category,
      subscriptionEligible: d.subscriptionEligible, daysOfSupply: d.daysOfSupply, consumption: d.consumption,
      subscriptionProductId: d.subscriptionProductId ?? null, isSubscriptionOnly: d.isSubscriptionOnly, minSubscriptionMonths: d.minSubscriptionMonths,
      recommendationBasis: d.recommendationBasis, recommendationPriority: d.recommendationPriority, marginPriority: d.marginPriority,
      isCoreEligible: d.isCoreEligible, isBoosterEligible: d.isBoosterEligible, cost: d.cost,
    }
    const res = await fetch('/api/portal/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.id, patch }) })
    const data = await res.json()
    setSaving(false)
    setResult(res.ok ? (data.shopify?.written ? 'Saved & pushed to Shopify ✓' : data.shopify?.error ? `Saved locally · Shopify: ${data.shopify.error}` : 'Saved ✓') : 'Save failed')
    if (res.ok) onSaved()
  }

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="flex items-center justify-between gap-3 py-2 border-b border-[var(--color-border)]">
      <span className="text-xs text-[var(--color-text-2)]">{label}</span>
      <span className="flex items-center gap-2">{children}</span>
    </label>
  )
  const numInput = (value: number | undefined, onChange: (n: number) => void) => (
    <input type="number" value={value ?? 0} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-20 px-2 py-1 rounded-lg text-sm text-right outline-none" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
  )
  const toggle = (value: boolean, onChange: (b: boolean) => void) => (
    <button onClick={() => onChange(!value)} className="w-11 h-6 rounded-full transition-colors relative" style={{ background: value ? ACCENT : 'var(--color-border-2)' }}>
      <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: value ? '22px' : '2px' }} />
    </button>
  )

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose() }} style={{ background: 'rgba(0,0,0,0.72)' }}>
      <div className="w-full max-w-lg rounded-t-3xl overflow-hidden flex flex-col" style={{ background: 'var(--color-surface)', maxHeight: '92dvh' }}>
        <div className="px-5 pt-4 pb-3 flex items-start justify-between border-b border-[var(--color-border)]">
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>{d.category}</p>
            <h3 className="text-lg font-black text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>{d.title}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-muted)] bg-[var(--color-surface-2)]">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-3 text-sm">
          {/* Classification */}
          <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mt-1 mb-1">Stack slots</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {STACK_SLOTS.map((s) => (
              <button key={s} onClick={() => set({ stackSlots: toggleIn(d.stackSlots, s) as StackSlot[] })} className="px-2 py-1 rounded-full text-[10px] font-semibold"
                style={{ background: d.stackSlots.includes(s) ? ACCENT : 'var(--color-surface-2)', color: d.stackSlots.includes(s) ? 'var(--color-bg)' : 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
                {SLOT_LABELS[s]}
              </button>
            ))}
          </div>
          <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mb-1">Goals</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {GOALS.map((g) => (
              <button key={g} onClick={() => set({ goals: toggleIn(d.goals as string[], g) as CatalogueProduct['goals'] })} className="px-2 py-1 rounded-full text-[10px] font-semibold"
                style={{ background: (d.goals as string[]).includes(g) ? ACCENT : 'var(--color-surface-2)', color: (d.goals as string[]).includes(g) ? 'var(--color-bg)' : 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
                {g}
              </button>
            ))}
          </div>
          <Row label="Swap group">
            <input value={d.swapGroup} onChange={(e) => set({ swapGroup: e.target.value as CatalogueProduct['swapGroup'] })} className="w-40 px-2 py-1 rounded-lg text-sm outline-none" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
          </Row>

          {/* Subscription */}
          <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mt-4 mb-1">Subscription</p>
          <Row label="Subscription-eligible">{toggle(d.subscriptionEligible, (b) => set({ subscriptionEligible: b }))}</Row>
          <Row label="Days of supply">{numInput(d.daysOfSupply, (n) => set({ daysOfSupply: n }))}</Row>
          <Row label="Consumption cadence">
            <select value={d.consumption?.cadence ?? 'auto'} onChange={(e) => set({ consumption: e.target.value === 'auto' ? undefined : { cadence: e.target.value as 'daily' | 'per-workout', dosesPerUnit: d.consumption?.dosesPerUnit ?? d.daysOfSupply } })} className="px-2 py-1 rounded-lg text-sm outline-none" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
              <option value="auto">Auto (from slot)</option>
              <option value="daily">Daily</option>
              <option value="per-workout">Per workout</option>
            </select>
          </Row>
          {d.consumption && <Row label="Doses per unit">{numInput(d.consumption.dosesPerUnit, (n) => set({ consumption: { cadence: d.consumption!.cadence, dosesPerUnit: n } }))}</Row>}
          <Row label="Monthly refill product">
            <select value={d.subscriptionProductId ?? ''} onChange={(e) => set({ subscriptionProductId: e.target.value || null })} className="w-44 px-2 py-1 rounded-lg text-sm outline-none" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
              <option value="">— None (ships as itself) —</option>
              {allProducts.filter((p) => p.id !== d.id).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </Row>
          <Row label="Subscription-only refill">{toggle(!!d.isSubscriptionOnly, (b) => set({ isSubscriptionOnly: b }))}</Row>
          <Row label="Min term override (months)">{numInput(d.minSubscriptionMonths, (n) => set({ minSubscriptionMonths: n || undefined }))}</Row>

          {/* Recommendation + commerce */}
          <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mt-4 mb-1">Recommendation & commerce</p>
          <Row label="Recommendation basis">
            <select value={d.recommendationBasis ?? 'auto'} onChange={(e) => set({ recommendationBasis: e.target.value === 'auto' ? undefined : (e.target.value as 'objective' | 'subjective') })} className="px-2 py-1 rounded-lg text-sm outline-none" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
              <option value="auto">Auto (from slot)</option>
              <option value="objective">Objective (a need)</option>
              <option value="subjective">Subjective (felt)</option>
            </select>
          </Row>
          <Row label="Recommendation priority">{numInput(d.recommendationPriority, (n) => set({ recommendationPriority: n }))}</Row>
          <Row label="Margin priority">{numInput(d.marginPriority, (n) => set({ marginPriority: n }))}</Row>
          <Row label="Core-eligible">{toggle(d.isCoreEligible, (b) => set({ isCoreEligible: b }))}</Row>
          <Row label="Booster-eligible">{toggle(d.isBoosterEligible, (b) => set({ isBoosterEligible: b }))}</Row>
          <Row label="Cost (£)">{numInput(d.cost, (n) => set({ cost: n }))}</Row>
        </div>

        <div className="px-5 py-3 border-t border-[var(--color-border)] flex items-center gap-3">
          {result && <span className="text-xs text-[var(--color-text-2)] flex-1">{result}</span>}
          <button onClick={save} disabled={saving} className="ml-auto py-2.5 px-5 rounded-2xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)]" style={{ fontFamily: 'var(--font-display)' }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
