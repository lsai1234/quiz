'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CatalogueProduct } from '@/lib/catalogue/types'

const ACCENT = '#00D4FF'

type Patch = Partial<CatalogueProduct> & { consumption?: { cadence: string; dosesPerUnit: number } }
interface Suggestion { id: string; title: string; patch: Patch; source: string }
interface Field { key: keyof Patch; label: string }

function describe(patch: Patch): Field[] {
  const out: Field[] = []
  if (patch.stackSlots?.length) out.push({ key: 'stackSlots', label: `Slots · ${patch.stackSlots.join(', ')}` })
  if (patch.goals?.length) out.push({ key: 'goals', label: `Goals · ${(patch.goals as string[]).join(', ')}` })
  if (patch.dietaryTags?.length) out.push({ key: 'dietaryTags', label: `Dietary · ${patch.dietaryTags.join(', ')}` })
  if (patch.swapGroup) out.push({ key: 'swapGroup', label: `Swap group · ${patch.swapGroup}` })
  if (patch.daysOfSupply) out.push({ key: 'daysOfSupply', label: `${patch.daysOfSupply}-day supply` })
  if (patch.consumption) out.push({ key: 'consumption', label: `Cadence · ${patch.consumption.cadence}` })
  if (patch.recommendationBasis) out.push({ key: 'recommendationBasis', label: `Basis · ${patch.recommendationBasis}` })
  if (patch.cost != null) out.push({ key: 'cost', label: `Est. cost · £${patch.cost}` })
  return out
}

interface Props { onClose: () => void; onApplied: () => void }

export function AiSuggestPanel({ onClose, onApplied }: Props) {
  const [loading, setLoading] = useState(true)
  const [usedAI, setUsedAI] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [excluded, setExcluded] = useState<Set<string>>(new Set()) // `${id}:${key}`
  const [applied, setApplied] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/portal/ai-classify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apply: false }) })
      .then((r) => r.json())
      .then((d) => {
        setUsedAI(!!d.usedAI)
        setSuggestions((d.results ?? []).filter((r: Suggestion) => Object.keys(r.patch).length > 0))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const toggle = (id: string, key: string) => {
    const k = `${id}:${key}`
    setExcluded((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  }

  function includedPatch(s: Suggestion): Patch {
    const patch: Patch = {}
    for (const f of describe(s.patch)) {
      if (!excluded.has(`${s.id}:${String(f.key)}`)) (patch as Record<string, unknown>)[f.key as string] = (s.patch as Record<string, unknown>)[f.key as string]
    }
    return patch
  }

  async function apply(s: Suggestion) {
    const patch = includedPatch(s)
    if (Object.keys(patch).length === 0) return
    setBusy(true)
    await fetch('/api/portal/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, patch }) })
    setApplied((a) => new Set(a).add(s.id))
    setBusy(false)
    onApplied()
  }

  async function applyAll() {
    setBusy(true)
    for (const s of suggestions) {
      if (applied.has(s.id)) continue
      const patch = includedPatch(s)
      if (Object.keys(patch).length === 0) continue
      await fetch('/api/portal/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, patch }) })
      setApplied((a) => new Set(a).add(s.id))
    }
    setBusy(false)
    onApplied()
  }

  const pending = suggestions.filter((s) => !applied.has(s.id))

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose() }} style={{ background: 'rgba(0,0,0,0.72)' }}>
      <div className="w-full max-w-lg rounded-t-3xl overflow-hidden flex flex-col" style={{ background: 'var(--color-surface)', maxHeight: '92dvh' }}>
        <div className="px-5 pt-4 pb-3 flex items-start justify-between border-b border-[var(--color-border)]">
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
              ✨ AI suggestions {usedAI ? '· OpenAI' : '· built-in rules'}
            </p>
            <h3 className="text-lg font-black text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Review &amp; apply tags</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-muted)] bg-[var(--color-surface-2)]">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-3">
          {loading ? (
            <p className="text-sm text-[var(--color-muted)] py-8 text-center">Analysing your catalogue…</p>
          ) : pending.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)] py-8 text-center">{suggestions.length ? 'All suggestions applied ✓' : 'Nothing to suggest — everything looks tagged.'}</p>
          ) : (
            <p className="text-xs text-[var(--color-muted)] mb-3 leading-relaxed">
              Suggested tags for {pending.length} product{pending.length === 1 ? '' : 's'} that need attention. Tap a chip to exclude it, then apply.
            </p>
          )}

          <div className="space-y-3">
            {suggestions.map((s) => {
              const done = applied.has(s.id)
              const fields = describe(s.patch)
              return (
                <div key={s.id} className="rounded-2xl border p-4" style={{ background: 'var(--color-surface-2)', borderColor: done ? 'color-mix(in srgb, #34d399 40%, transparent)' : 'var(--color-border)', opacity: done ? 0.6 : 1 }}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-sm font-bold text-[var(--color-text)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{s.title}</p>
                    {done && <span className="text-[10px] font-bold" style={{ color: '#34d399' }}>Applied ✓</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {fields.map((f) => {
                      const off = excluded.has(`${s.id}:${String(f.key)}`)
                      return (
                        <button key={String(f.key)} onClick={() => !done && toggle(s.id, String(f.key))} disabled={done}
                          className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
                          style={{
                            background: off ? 'transparent' : `color-mix(in srgb, ${ACCENT} 12%, transparent)`,
                            color: off ? 'var(--color-muted)' : ACCENT,
                            border: `1px solid ${off ? 'var(--color-border)' : `color-mix(in srgb, ${ACCENT} 30%, transparent)`}`,
                            textDecoration: off ? 'line-through' : 'none',
                          }}>
                          {f.label}
                        </button>
                      )
                    })}
                  </div>
                  {!done && (
                    <button onClick={() => apply(s)} disabled={busy} className="mt-3 text-xs font-bold px-3 py-2 rounded-xl border border-[var(--color-border-2)] text-[var(--color-text-2)]" style={{ fontFamily: 'var(--font-display)' }}>
                      Apply to this product
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {pending.length > 0 && (
          <div className="px-5 py-3 border-t border-[var(--color-border)]">
            <button onClick={applyAll} disabled={busy} className="w-full py-3 rounded-2xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)]" style={{ fontFamily: 'var(--font-display)' }}>
              {busy ? 'Applying…' : `Apply all (${pending.length})`}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
