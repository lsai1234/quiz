'use client'

import { useEffect, useState } from 'react'
import type { CatalogueCoverage, CoverageItem, CoverageStatus } from '@/lib/portal/coverage'

const DOT: Record<CoverageStatus, string> = { ok: 'var(--tone-positive)', warn: 'var(--tone-attention)', fail: 'var(--tone-critical)' }
const RANK: Record<CoverageStatus, number> = { fail: 0, warn: 1, ok: 2 }

function Group({ title, subtitle, items }: { title: string; subtitle: string; items: CoverageItem[] }) {
  const sorted = [...items].sort((a, b) => RANK[a.status] - RANK[b.status])
  return (
    <div className="mb-6">
      <p className="text-sm font-bold" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>{title}</p>
      <p className="text-xs text-[var(--ink-3)] mb-3">{subtitle}</p>
      <div className="space-y-2">
        {sorted.map((i) => (
          <div key={i.key} className="rounded-2xl border p-3.5" style={{ background: 'var(--surface-1)', borderColor: i.status === 'fail' ? 'color-mix(in srgb, var(--tone-critical) 40%, transparent)' : 'var(--edge)' }}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: DOT[i.status] }} />
                <span className="text-sm font-bold text-[var(--ink-1)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{i.label}</span>
              </div>
              <span className="text-[11px] text-[var(--ink-3)] flex-shrink-0">{i.productCount} product{i.productCount === 1 ? '' : 's'} · {i.subscriptionCount} sub</span>
            </div>
            {i.note && <p className="text-[11px] mt-1.5 leading-snug" style={{ color: i.status === 'fail' ? 'var(--tone-critical)' : 'var(--ink-2)' }}>{i.note}</p>}
            {i.productTitles.length > 0 && <p className="text-[10px] text-[var(--ink-3)] mt-1 truncate">{i.productTitles.join(', ')}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CoveragePage() {
  const [cov, setCov] = useState<CatalogueCoverage | null>(null)

  useEffect(() => {
    fetch('/api/portal/coverage').then((r) => r.json()).then((d) => setCov(d.coverage)).catch(() => {})
  }, [])

  return (
    <div>
      <h2 className="text-lg font-black mb-1" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>Coverage</h2>
      <p className="text-sm text-[var(--ink-3)] mb-5">Where the quiz can recommend something — does the range actually back it up?</p>

      {!cov ? (
        <p className="text-sm text-[var(--ink-3)]">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="rounded-2xl border border-[var(--edge)] bg-[var(--surface-2)] p-4 text-center">
              <p className="text-2xl font-black" style={{ color: cov.gaps > 0 ? 'var(--tone-critical)' : 'var(--tone-positive)', fontFamily: 'var(--font-display)' }}>{cov.gaps}</p>
              <p className="text-[11px] text-[var(--ink-3)] mt-0.5">Gaps (nothing backs it)</p>
            </div>
            <div className="rounded-2xl border border-[var(--edge)] bg-[var(--surface-2)] p-4 text-center">
              <p className="text-2xl font-black" style={{ color: cov.thin > 0 ? 'var(--tone-attention)' : 'var(--tone-positive)', fontFamily: 'var(--font-display)' }}>{cov.thin}</p>
              <p className="text-[11px] text-[var(--ink-3)] mt-0.5">Thin (1 product / no sub)</p>
            </div>
          </div>

          <Group title="Goals" subtitle="Every outcome the quiz can target." items={cov.goals} />
          <Group title="Stack slots" subtitle="Every functional job a stack can include." items={cov.slots} />
        </>
      )}
    </div>
  )
}
