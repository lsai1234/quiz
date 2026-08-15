'use client'

import { useState } from 'react'
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/system'
import { STACK_SLOTS, SLOT_LABELS, type StackSlot } from '@/lib/catalogue/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'

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
      subscriptionEligible: d.subscriptionEligible, servings: d.servings, consumption: d.consumption,
      subscriptionProductId: d.subscriptionProductId ?? null, isSubscriptionOnly: d.isSubscriptionOnly, minSubscriptionMonths: d.minSubscriptionMonths,
      recommendationBasis: d.recommendationBasis, effectOnset: d.effectOnset, recommendationPriority: d.recommendationPriority, marginPriority: d.marginPriority,
      isCoreEligible: d.isCoreEligible, isBoosterEligible: d.isBoosterEligible, cost: d.cost,
    }
    const res = await fetch('/api/portal/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.id, patch }) })
    const data = await res.json()
    setSaving(false)
    setResult(res.ok ? 'Saved ✓' : 'Save failed')
    if (res.ok) onSaved()
  }

  const numInput = (value: number | undefined, onChange: (n: number) => void) => (
    <input type="number" value={value ?? 0} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-20 px-2 py-1 rounded-lg text-sm text-right outline-none" style={{ background: 'var(--surface-2)', border: '1px solid var(--edge)', color: 'var(--ink-1)' }} />
  )
  const toggle = (value: boolean, onChange: (b: boolean) => void) => (
    <button onClick={() => onChange(!value)} className="w-11 h-6 rounded-full transition-colors relative flex-shrink-0" style={{ background: value ? 'var(--accent)' : 'var(--edge-strong)' }}>
      <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: value ? '22px' : '2px' }} />
    </button>
  )
  return (
    <Modal onClose={onClose} size="lg">
      <ModalHeader title={d.title} subtitle={d.category} />
      <ModalBody>
          {/* Tags */}
          <Group title="Tags" desc="These decide when the quiz recommends this product.">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-3)] mb-1.5">What it’s for</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {STACK_SLOTS.map((s) => (
                <Chip key={s} on={d.stackSlots.includes(s)} onClick={() => set({ stackSlots: toggleIn(d.stackSlots, s) as StackSlot[] })}>{SLOT_LABELS[s]}</Chip>
              ))}
            </div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-3)] mb-1.5">Goals it supports</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {GOALS.map((g) => (
                <Chip key={g} on={(d.goals as string[]).includes(g)} onClick={() => set({ goals: toggleIn(d.goals as string[], g) as CatalogueProduct['goals'] })}>{g}</Chip>
              ))}
            </div>
            <Row label="Alternatives group" help="Products in the same group can be swapped for each other.">
              <input value={d.swapGroup} onChange={(e) => set({ swapGroup: e.target.value as CatalogueProduct['swapGroup'] })} className="w-40 px-2 py-1 rounded-lg text-sm outline-none" style={{ background: 'var(--surface-2)', border: '1px solid var(--edge)', color: 'var(--ink-1)' }} />
            </Row>
          </Group>

          {/* Subscription */}
          <Group title="Subscription">
            <Row label="Offer on subscription">{toggle(d.subscriptionEligible, (b) => set({ subscriptionEligible: b }))}</Row>
            <Row label="Servings per unit" help="How many servings one unit/container holds at the normal dose.">{numInput(d.servings, (n) => set({ servings: n }))}</Row>
            <Row label="How it’s taken">
              <select value={d.consumption?.cadence ?? 'auto'} onChange={(e) => set({ consumption: e.target.value === 'auto' ? undefined : { cadence: e.target.value as 'daily' | 'per-workout', servingsPerUnit: d.consumption?.servingsPerUnit ?? d.servings } })} className="px-2 py-1 rounded-lg text-sm outline-none" style={{ background: 'var(--surface-2)', border: '1px solid var(--edge)', color: 'var(--ink-1)' }}>
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
          <button onClick={() => setAdvanced((a) => !a)} className="w-full text-left text-xs font-bold py-2" style={{ color: 'var(--accent)' }}>
            {advanced ? '▾ Hide advanced settings' : '▸ Advanced settings'}
          </button>
          {advanced && (
            <Group title="">
              <Row label="Servings per unit override">{numInput(d.consumption?.servingsPerUnit, (n) => set({ consumption: { cadence: d.consumption?.cadence ?? 'daily', servingsPerUnit: n } }))}</Row>
              <Row label="Monthly refill product" help="If this lasts longer than a month, the smaller product it ships on subscription.">
                <select value={d.subscriptionProductId ?? ''} onChange={(e) => set({ subscriptionProductId: e.target.value || null })} className="w-44 px-2 py-1 rounded-lg text-sm outline-none" style={{ background: 'var(--surface-2)', border: '1px solid var(--edge)', color: 'var(--ink-1)' }}>
                  <option value="">— Ships as itself —</option>
                  {allProducts.filter((p) => p.id !== d.id).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </Row>
              <Row label="Hidden refill product" help="A small product that only exists as a subscription refill — kept out of the quiz.">{toggle(!!d.isSubscriptionOnly, (b) => set({ isSubscriptionOnly: b }))}</Row>
              <Row label="Minimum term override (months)">{numInput(d.minSubscriptionMonths, (n) => set({ minSubscriptionMonths: n || undefined }))}</Row>
              <Row label="Keep-vs-change advice">
                <select value={d.recommendationBasis ?? 'auto'} onChange={(e) => set({ recommendationBasis: e.target.value === 'auto' ? undefined : (e.target.value as 'objective' | 'subjective') })} className="px-2 py-1 rounded-lg text-sm outline-none" style={{ background: 'var(--surface-2)', border: '1px solid var(--edge)', color: 'var(--ink-1)' }}>
                  <option value="auto">Auto</option>
                  <option value="objective">A need (don’t change on a mood)</option>
                  <option value="subjective">Felt (change if not working)</option>
                </select>
              </Row>
              <Row label="When it’s felt (onset)" help="Drives the hub check-in: slow-build items aren’t judged before their time; immediate ones are reviewed straight away.">
                <select value={d.effectOnset ?? 'auto'} onChange={(e) => set({ effectOnset: e.target.value === 'auto' ? undefined : (e.target.value as NonNullable<CatalogueProduct['effectOnset']>) })} className="px-2 py-1 rounded-lg text-sm outline-none" style={{ background: 'var(--surface-2)', border: '1px solid var(--edge)', color: 'var(--ink-1)' }}>
                  <option value="auto">Auto</option>
                  <option value="immediate">Immediate (same session)</option>
                  <option value="short">Short (~1–3 weeks)</option>
                  <option value="long">Long (~6–12 weeks)</option>
                  <option value="none">Never felt (a need)</option>
                </select>
              </Row>
              <Row label="Recommendation priority (1–10)">{numInput(d.recommendationPriority, (n) => set({ recommendationPriority: n }))}</Row>
              <Row label="Margin priority (1–10)">{numInput(d.marginPriority, (n) => set({ marginPriority: n }))}</Row>
              <Row label="Can be a core product">{toggle(d.isCoreEligible, (b) => set({ isCoreEligible: b }))}</Row>
              <Row label="Can be a booster">{toggle(d.isBoosterEligible, (b) => set({ isBoosterEligible: b }))}</Row>
            </Group>
          )}
      </ModalBody>
      <ModalFooter>
        {result && (
          <span
            className="flex-1"
            // `role="status"` so a save result is announced rather than only
            // appearing — this line reports both success and failure.
            role="status"
            style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-2)' }}
          >
            {result}
          </span>
        )}
        <Button variant="secondary" size="sm" icon="sparkle" onClick={aiSuggest} loading={suggesting}>
          AI suggest
        </Button>
        <Button variant="primary" onClick={save} loading={saving}>Save</Button>
      </ModalFooter>
    </Modal>
  )
}

function Row({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5 border-b border-[var(--edge)] last:border-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-[var(--ink-1)]">{label}</span>
        <span className="flex items-center gap-2 flex-shrink-0">{children}</span>
      </div>
      {help && <p className="text-[11px] text-[var(--ink-3)] mt-0.5 leading-snug">{help}</p>}
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
      style={{ background: on ? 'var(--accent)' : 'var(--surface-2)', color: on ? 'var(--ground-base)' : 'var(--ink-3)', border: '1px solid var(--edge)' }}>
      {children}
    </button>
  )
}

function Group({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      {title && <p className="text-sm font-bold mt-2" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>{title}</p>}
      {desc && <p className="text-[11px] text-[var(--ink-3)] mb-1">{desc}</p>}
      <div className="rounded-2xl border border-[var(--edge)] bg-[var(--surface-1)] p-3 mt-1">{children}</div>
    </div>
  )
}
