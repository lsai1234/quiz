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
  const [suggesting, setSuggesting] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [advanced, setAdvanced] = useState(false)

  const set = (patch: Partial<CatalogueProduct>) => setD((p) => ({ ...p, ...patch }))
  const toggleIn = <T,>(arr: T[], v: T): T[] => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  async function aiSuggest() {
    setSuggesting(true); setResult(null)
    const res = await fetch('/api/portal/ai-classify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [product.id], apply: false }) })
    const data = await res.json()
    const patch = data.results?.[0]?.patch ?? {}
    if (Object.keys(patch).length) { set(patch); setResult(`AI filled: ${Object.keys(patch).join(', ')} — review & save`) }
    else setResult('Nothing missing — no suggestions.')
    setSuggesting(false)
  }

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
    setResult(res.ok ? (data.shopify?.written ? 'Saved & pushed to Shopify ✓' : data.shopify?.error ? `Saved · Shopify: ${data.shopify.error}` : 'Saved ✓') : 'Save failed')
    if (res.ok) onSaved()
  }

  const numInput = (value: number | undefined, onChange: (n: number) => void) => (
    <input type="number" value={value ?? 0} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-20 px-2 py-1 rounded-lg text-sm text-right outline-none" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
  )
  const toggle = (value: boolean, onChange: (b: boolean) => void) => (
    <button onClick={() => onChange(!value)} className="w-11 h-6 rounded-full transition-colors relative flex-shrink-0" style={{ background: value ? ACCENT : 'var(--color-border-2)' }}>
      <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: value ? '22px' : '2px' }} />
    </button>
  )
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose() }} style={{ background: 'rgba(0,0,0,0.72)' }}>
      <div className="w-full max-w-lg rounded-t-3xl overflow-hidden flex flex-col" style={{ background: 'var(--color-surface)', maxHeight: '92dvh' }}>
        <div className="px-5 pt-4 pb-3 flex items-start justify-between border-b border-[var(--color-border)]">
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-widest uppercase truncate" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>{d.category}</p>
            <h3 className="text-lg font-black text-[var(--color-text)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{d.title}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-muted)] bg-[var(--color-surface-2)] flex-shrink-0">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-3">
          {/* Tags */}
          <Group title="Tags" desc="These decide when the quiz recommends this product.">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-muted)] mb-1.5">What it’s for</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {STACK_SLOTS.map((s) => (
                <Chip key={s} on={d.stackSlots.includes(s)} onClick={() => set({ stackSlots: toggleIn(d.stackSlots, s) as StackSlot[] })}>{SLOT_LABELS[s]}</Chip>
              ))}
            </div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-muted)] mb-1.5">Goals it supports</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {GOALS.map((g) => (
                <Chip key={g} on={(d.goals as string[]).includes(g)} onClick={() => set({ goals: toggleIn(d.goals as string[], g) as CatalogueProduct['goals'] })}>{g}</Chip>
              ))}
            </div>
            <Row label="Alternatives group" help="Products in the same group can be swapped for each other.">
              <input value={d.swapGroup} onChange={(e) => set({ swapGroup: e.target.value as CatalogueProduct['swapGroup'] })} className="w-40 px-2 py-1 rounded-lg text-sm outline-none" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
            </Row>
          </Group>

          {/* Subscription */}
          <Group title="Subscription">
            <Row label="Offer on subscription">{toggle(d.subscriptionEligible, (b) => set({ subscriptionEligible: b }))}</Row>
            <Row label="Lasts about (days)" help="How long one unit lasts at the normal dose.">{numInput(d.daysOfSupply, (n) => set({ daysOfSupply: n }))}</Row>
            <Row label="How it’s taken">
              <select value={d.consumption?.cadence ?? 'auto'} onChange={(e) => set({ consumption: e.target.value === 'auto' ? undefined : { cadence: e.target.value as 'daily' | 'per-workout', dosesPerUnit: d.consumption?.dosesPerUnit ?? d.daysOfSupply } })} className="px-2 py-1 rounded-lg text-sm outline-none" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                <option value="auto">Auto</option>
                <option value="daily">Every day</option>
                <option value="per-workout">On training days</option>
              </select>
            </Row>
          </Group>

          {/* Cost */}
          <Group title="Cost">
            <Row label="Cost to us (£)" help="Used to keep discounts profitable. Leave 0 to estimate from price.">{numInput(d.cost, (n) => set({ cost: n }))}</Row>
          </Group>

          {/* Advanced */}
          <button onClick={() => setAdvanced((a) => !a)} className="w-full text-left text-xs font-bold py-2" style={{ color: ACCENT }}>
            {advanced ? '▾ Hide advanced settings' : '▸ Advanced settings'}
          </button>
          {advanced && (
            <Group title="">
              <Row label="Servings per unit">{numInput(d.consumption?.dosesPerUnit, (n) => set({ consumption: { cadence: d.consumption?.cadence ?? 'daily', dosesPerUnit: n } }))}</Row>
              <Row label="Monthly refill product" help="If this lasts longer than a month, the smaller product it ships on subscription.">
                <select value={d.subscriptionProductId ?? ''} onChange={(e) => set({ subscriptionProductId: e.target.value || null })} className="w-44 px-2 py-1 rounded-lg text-sm outline-none" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                  <option value="">— Ships as itself —</option>
                  {allProducts.filter((p) => p.id !== d.id).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </Row>
              <Row label="Hidden refill product" help="A small product that only exists as a subscription refill — kept out of the quiz.">{toggle(!!d.isSubscriptionOnly, (b) => set({ isSubscriptionOnly: b }))}</Row>
              <Row label="Minimum term override (months)">{numInput(d.minSubscriptionMonths, (n) => set({ minSubscriptionMonths: n || undefined }))}</Row>
              <Row label="Keep-vs-change advice">
                <select value={d.recommendationBasis ?? 'auto'} onChange={(e) => set({ recommendationBasis: e.target.value === 'auto' ? undefined : (e.target.value as 'objective' | 'subjective') })} className="px-2 py-1 rounded-lg text-sm outline-none" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                  <option value="auto">Auto</option>
                  <option value="objective">A need (don’t change on a mood)</option>
                  <option value="subjective">Felt (change if not working)</option>
                </select>
              </Row>
              <Row label="Recommendation priority (1–10)">{numInput(d.recommendationPriority, (n) => set({ recommendationPriority: n }))}</Row>
              <Row label="Margin priority (1–10)">{numInput(d.marginPriority, (n) => set({ marginPriority: n }))}</Row>
              <Row label="Can be a core product">{toggle(d.isCoreEligible, (b) => set({ isCoreEligible: b }))}</Row>
              <Row label="Can be a booster">{toggle(d.isBoosterEligible, (b) => set({ isBoosterEligible: b }))}</Row>
            </Group>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[var(--color-border)] flex items-center gap-2">
          {result && <span className="text-[11px] text-[var(--color-text-2)] flex-1 leading-snug">{result}</span>}
          <button onClick={aiSuggest} disabled={suggesting} className="ml-auto py-2.5 px-3 rounded-2xl text-xs font-bold border border-[var(--color-border-2)] text-[var(--color-text-2)]" style={{ fontFamily: 'var(--font-display)' }}>{suggesting ? '…' : '✨ AI suggest'}</button>
          <button onClick={save} disabled={saving} className="py-2.5 px-5 rounded-2xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)]" style={{ fontFamily: 'var(--font-display)' }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Row({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5 border-b border-[var(--color-border)] last:border-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-[var(--color-text)]">{label}</span>
        <span className="flex items-center gap-2 flex-shrink-0">{children}</span>
      </div>
      {help && <p className="text-[11px] text-[var(--color-muted)] mt-0.5 leading-snug">{help}</p>}
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
      style={{ background: on ? ACCENT : 'var(--color-surface-2)', color: on ? 'var(--color-bg)' : 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
      {children}
    </button>
  )
}

function Group({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      {title && <p className="text-sm font-bold mt-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>{title}</p>}
      {desc && <p className="text-[11px] text-[var(--color-muted)] mb-1">{desc}</p>}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 mt-1">{children}</div>
    </div>
  )
}
