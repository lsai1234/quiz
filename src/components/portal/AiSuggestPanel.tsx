'use client'

import { useEffect, useState } from 'react'
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/system'
import type { CatalogueProduct } from '@/lib/catalogue/types'


type Sug = Partial<CatalogueProduct> & { consumption?: { cadence: string; servingsPerUnit: number } }
interface Result { id: string; title: string; suggestion: Sug; current: Partial<CatalogueProduct>; source: string }

const KEY_FIELDS = ['stackSlots', 'goals', 'swapGroup', 'subscriptionEligible'] as const
const OTHER_FIELDS = ['servings', 'consumption', 'recommendationBasis', 'cost', 'dietaryTags'] as const

function otherSummary(s: Sug): string {
  const bits: string[] = []
  if (s.servings) bits.push(`${s.servings} servings`)
  if (s.consumption) bits.push(s.consumption.cadence === 'per-workout' ? 'taken per workout' : 'taken daily')
  if (s.recommendationBasis) bits.push(s.recommendationBasis === 'subjective' ? 'felt benefit' : 'a need')
  if (s.cost != null) bits.push(`est. cost £${s.cost}`)
  if (s.dietaryTags?.length) bits.push(s.dietaryTags.join(', '))
  return bits.join(' · ')
}

interface Props { onClose: () => void; onApplied: () => void }

export function AiSuggestPanel({ onClose, onApplied }: Props) {
  const [loading, setLoading] = useState(true)
  const [usedAI, setUsedAI] = useState(false)
  const [results, setResults] = useState<Result[]>([])
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [applied, setApplied] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/portal/ai-classify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apply: false }) })
      .then((r) => r.json())
      .then((d) => { setUsedAI(!!d.usedAI); setResults(d.results ?? []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const off = (id: string, key: string) => excluded.has(`${id}:${key}`)
  const toggle = (id: string, key: string) => setExcluded((s) => { const n = new Set(s); const k = `${id}:${key}`; n.has(k) ? n.delete(k) : n.add(k); return n })

  function buildPatch(r: Result): Sug {
    const p: Sug = {}
    for (const k of KEY_FIELDS) if (!off(r.id, k) && r.suggestion[k] !== undefined) (p as Record<string, unknown>)[k] = r.suggestion[k]
    if (!off(r.id, 'other')) for (const k of OTHER_FIELDS) if (r.suggestion[k] !== undefined) (p as Record<string, unknown>)[k] = r.suggestion[k]
    return p
  }

  async function apply(r: Result) {
    const patch = buildPatch(r)
    if (Object.keys(patch).length === 0) return
    setBusy(true)
    await fetch('/api/portal/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, patch }) })
    setApplied((a) => new Set(a).add(r.id)); setBusy(false); onApplied()
  }
  async function applyAll() {
    setBusy(true)
    for (const r of results) {
      if (applied.has(r.id)) continue
      const patch = buildPatch(r)
      if (Object.keys(patch).length === 0) continue
      await fetch('/api/portal/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, patch }) })
      setApplied((a) => new Set(a).add(r.id))
    }
    setBusy(false); onApplied()
  }

  const pending = results.filter((r) => !applied.has(r.id))

  const Chip = ({ id, fkey, label }: { id: string; fkey: string; label: string }) => {
    const isOff = off(id, fkey)
    return (
      <button onClick={() => toggle(id, fkey)} className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
        style={{ background: isOff ? 'transparent' : `var(--accent-fill)`, color: isOff ? 'var(--ink-3)' : 'var(--accent)', border: `1px solid ${isOff ? 'var(--edge)' : `var(--accent-line)`}`, textDecoration: isOff ? 'line-through' : 'none' }}>
        {label}
      </button>
    )
  }

  function FieldRow({ r, fkey, title, children }: { r: Result; fkey: string; title: string; children: React.ReactNode }) {
    return (
      <div className="flex items-start gap-2 py-1.5">
        <input type="checkbox" checked={!off(r.id, fkey)} onChange={() => toggle(r.id, fkey)} className="mt-1 accent-[var(--accent)]" />
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-3)]">{title}</p>
          <div className="text-sm text-[var(--ink-1)]">{children}</div>
        </div>
      </div>
    )
  }

  return (
    <Modal onClose={onClose} size="lg">
      <ModalHeader
        title="Review suggested tags"
        subtitle={`AI tagging · ${usedAI ? 'OpenAI' : 'built-in rules'}`}
      />
      <ModalBody>
          {loading ? (
            <p className="text-sm text-[var(--ink-3)] py-8 text-center">Analysing your catalogue…</p>
          ) : pending.length === 0 ? (
            <p className="text-sm text-[var(--ink-3)] py-8 text-center">{results.length ? 'All suggestions applied ✓' : 'Nothing to suggest.'}</p>
          ) : (
            <p className="text-xs text-[var(--ink-3)] mb-3 leading-relaxed">Untick anything you don’t want, then apply. {pending.length} product{pending.length === 1 ? '' : 's'} to review.</p>
          )}

          <div className="space-y-3">
            {results.map((r) => {
              const done = applied.has(r.id)
              const s = r.suggestion
              const subText = s.subscriptionEligible === false ? 'Not subscribable' : 'Subscribable'
              return (
                <div key={r.id} className="rounded-2xl border p-4" style={{ background: 'var(--surface-2)', borderColor: done ? 'color-mix(in srgb, var(--tone-positive) 40%, transparent)' : 'var(--edge)', opacity: done ? 0.6 : 1 }}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-sm font-bold text-[var(--ink-1)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{r.title}</p>
                    {done && <span className="text-[10px] font-bold" style={{ color: 'var(--tone-positive)' }}>Applied ✓</span>}
                  </div>

                  {!done && (
                    <div className="divide-y divide-[var(--edge)]">
                      <FieldRow r={r} fkey="stackSlots" title="Slots">
                        <span className="flex flex-wrap gap-1.5">{(s.stackSlots ?? []).map((x) => <Chip key={x} id={r.id} fkey="stackSlots" label={x} />)}</span>
                      </FieldRow>
                      <FieldRow r={r} fkey="goals" title="Goals">
                        <span className="flex flex-wrap gap-1.5">{((s.goals as string[]) ?? []).map((x) => <Chip key={x} id={r.id} fkey="goals" label={x} />)}</span>
                      </FieldRow>
                      <FieldRow r={r} fkey="swapGroup" title="Swap group (alternatives)">{s.swapGroup}</FieldRow>
                      <FieldRow r={r} fkey="subscriptionEligible" title="Subscription">{subText}</FieldRow>
                      <FieldRow r={r} fkey="other" title="Other details">
                        <span className="text-xs text-[var(--ink-3)]">{otherSummary(s) || '—'}</span>
                      </FieldRow>
                    </div>
                  )}

                  {!done && (
                    <div style={{ marginTop: 'var(--space-3)' }}>
                      <Button variant="secondary" size="sm" onClick={() => apply(r)} disabled={busy}>
                        Apply to this product
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
      </ModalBody>
      {pending.length > 0 && (
        <ModalFooter>
          <Button variant="primary" fullWidth onClick={applyAll} loading={busy}>
            {busy ? 'Applying' : `Apply all (${pending.length})`}
          </Button>
        </ModalFooter>
      )}
    </Modal>
  )
}
