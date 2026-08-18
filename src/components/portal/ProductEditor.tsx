'use client'

import { useState } from 'react'
import { Button, Card, Input, Modal, ModalBody, ModalFooter, ModalHeader, Select } from '@/components/system'
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

  // Both take the row's label so the control has a name of its own. Every one
  // of these used to be an unlabelled box or a bare sliding pill: a screen
  // reader announced "edit box" and "button", with no idea which setting.
  const numInput = (label: string, value: number | undefined, onChange: (n: number) => void) => (
    <Input
      label={label}
      compact
      align="right"
      className="w-24"
      type="number"
      value={value ?? 0}
      onChange={(e) => onChange(parseFloat(e.target.value))}
    />
  )
  // The same On/Off button the pricing rules use. This was a sliding switch —
  // a second shape for the same act, in a hub that already had one, and the one
  // with no accessible name and no pressed state.
  const toggle = (label: string, value: boolean, onChange: (b: boolean) => void) => (
    <Button
      size="sm"
      variant={value ? 'primary' : 'secondary'}
      aria-label={label}
      aria-pressed={value}
      onClick={() => onChange(!value)}
    >
      {value ? 'On' : 'Off'}
    </Button>
  )
  return (
    <Modal onClose={onClose} size="lg">
      <ModalHeader title={d.title} subtitle={d.category} />
      <ModalBody>
          {/* Tags */}
          <Group title="Tags" desc="These decide when the quiz recommends this product.">
            <p style={{ fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 'var(--space-2)' }}>
              What it’s for
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {STACK_SLOTS.map((s) => (
                <Chip key={s} on={d.stackSlots.includes(s)} onClick={() => set({ stackSlots: toggleIn(d.stackSlots, s) as StackSlot[] })}>{SLOT_LABELS[s]}</Chip>
              ))}
            </div>
            <p style={{ fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 'var(--space-2)' }}>
              Goals it supports
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {GOALS.map((g) => (
                <Chip key={g} on={(d.goals as string[]).includes(g)} onClick={() => set({ goals: toggleIn(d.goals as string[], g) as CatalogueProduct['goals'] })}>{g}</Chip>
              ))}
            </div>
            <Row label="Alternatives group" help="Products in the same group can be swapped for each other.">
              <Input
                label="Alternatives group"
                compact
                className="w-40"
                value={d.swapGroup}
                onChange={(e) => set({ swapGroup: e.target.value as CatalogueProduct['swapGroup'] })}
              />
            </Row>
          </Group>

          {/* Subscription */}
          <Group title="Subscription">
            <Row label="Offer on subscription">{toggle('Offer on subscription', d.subscriptionEligible, (b) => set({ subscriptionEligible: b }))}</Row>
            <Row label="Servings per unit" help="How many servings one unit/container holds at the normal dose.">{numInput('Servings per unit', d.servings, (n) => set({ servings: n }))}</Row>
            <Row label="How it’s taken">
              <Select
                label="How it’s taken"
                compact
                value={d.consumption?.cadence ?? 'auto'}
                onChange={(e) => set({ consumption: e.target.value === 'auto' ? undefined : { cadence: e.target.value as 'daily' | 'per-workout', servingsPerUnit: d.consumption?.servingsPerUnit ?? d.servings } })}
              >
                <option value="auto">Auto</option>
                <option value="daily">Every day</option>
                <option value="per-workout">On training days</option>
              </Select>
            </Row>
          </Group>

          {/* Cost */}
          <Group title="Cost">
            <Row label="Cost to us (£)" help="Used to keep discounts profitable. Leave 0 to estimate from price.">{numInput('Cost to us in pounds', d.cost, (n) => set({ cost: n }))}</Row>
          </Group>

          {/* Advanced */}
          {/* `aria-expanded` so the state is announced, not drawn with a
              triangle a screen reader never reads. */}
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            className="justify-start"
            icon={advanced ? 'chevron-down' : 'chevron-right'}
            aria-expanded={advanced}
            onClick={() => setAdvanced((a) => !a)}
          >
            {advanced ? 'Hide advanced settings' : 'Advanced settings'}
          </Button>
          {advanced && (
            <Group title="">
              <Row label="Servings per unit override">{numInput('Servings per unit override', d.consumption?.servingsPerUnit, (n) => set({ consumption: { cadence: d.consumption?.cadence ?? 'daily', servingsPerUnit: n } }))}</Row>
              <Row label="Monthly refill product" help="If this lasts longer than a month, the smaller product it ships on subscription.">
                <Select
                  label="Monthly refill product"
                  compact
                  className="w-44"
                  value={d.subscriptionProductId ?? ''}
                  onChange={(e) => set({ subscriptionProductId: e.target.value || null })}
                >
                  <option value="">— Ships as itself —</option>
                  {allProducts.filter((p) => p.id !== d.id).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </Select>
              </Row>
              <Row label="Hidden refill product" help="A small product that only exists as a subscription refill — kept out of the quiz.">{toggle('Hidden refill product', !!d.isSubscriptionOnly, (b) => set({ isSubscriptionOnly: b }))}</Row>
              <Row label="Minimum term override (months)">{numInput('Minimum term override in months', d.minSubscriptionMonths, (n) => set({ minSubscriptionMonths: n || undefined }))}</Row>
              <Row label="Keep-vs-change advice">
                <Select
                  label="Keep-vs-change advice"
                  compact
                  value={d.recommendationBasis ?? 'auto'}
                  onChange={(e) => set({ recommendationBasis: e.target.value === 'auto' ? undefined : (e.target.value as 'objective' | 'subjective') })}
                >
                  <option value="auto">Auto</option>
                  <option value="objective">A need (don’t change on a mood)</option>
                  <option value="subjective">Felt (change if not working)</option>
                </Select>
              </Row>
              <Row label="When it’s felt (onset)" help="Drives the hub check-in: slow-build items aren’t judged before their time; immediate ones are reviewed straight away.">
                <Select
                  label="When it’s felt (onset)"
                  compact
                  value={d.effectOnset ?? 'auto'}
                  onChange={(e) => set({ effectOnset: e.target.value === 'auto' ? undefined : (e.target.value as NonNullable<CatalogueProduct['effectOnset']>) })}
                >
                  <option value="auto">Auto</option>
                  <option value="immediate">Immediate (same session)</option>
                  <option value="short">Short (~1–3 weeks)</option>
                  <option value="long">Long (~6–12 weeks)</option>
                  <option value="none">Never felt (a need)</option>
                </Select>
              </Row>
              <Row label="Recommendation priority (1–10)">{numInput('Recommendation priority, 1 to 10', d.recommendationPriority, (n) => set({ recommendationPriority: n }))}</Row>
              <Row label="Margin priority (1–10)">{numInput('Margin priority, 1 to 10', d.marginPriority, (n) => set({ marginPriority: n }))}</Row>
              <Row label="Can be a core product">{toggle('Can be a core product', d.isCoreEligible, (b) => set({ isCoreEligible: b }))}</Row>
              <Row label="Can be a booster">{toggle('Can be a booster', d.isBoosterEligible, (b) => set({ isBoosterEligible: b }))}</Row>
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

/** One setting: name on the left, control on the right, consequence beneath. */
function Row({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 'var(--space-3) 0', borderBottom: '1px solid var(--edge)' }}>
      <div className="flex items-center justify-between gap-3">
        <span style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>
          {label}
        </span>
        <span className="flex items-center gap-2 shrink-0">{children}</span>
      </div>
      {help && (
        <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
          {help}
        </p>
      )}
    </div>
  )
}

/**
 * A tag that is on or off.
 *
 * `aria-pressed` is the whole difference: these were buttons whose only state
 * was their colour, so a screen-reader user could hear the tag list but not
 * which of them were applied.
 */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button size="sm" variant={on ? 'primary' : 'secondary'} aria-pressed={on} onClick={onClick}>
      {children}
    </Button>
  )
}

function Group({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      {title && (
        <p style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)', marginTop: 'var(--space-2)' }}>
          {title}
        </p>
      )}
      {desc && (
        <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>{desc}</p>
      )}
      <Card padding="tight" className="mt-1">
        {children}
      </Card>
    </div>
  )
}
