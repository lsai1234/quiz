'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { BillingImpact } from './BillingImpact'
import type { LineEconomics } from '@/lib/recharge/mock'

const ACCENT = '#00D4FF'

/** A pending, price-affecting change awaiting the member's confirmation. */
export interface PendingChange {
  /** Short heading, e.g. "Add to your plan". */
  title: string
  /** What it applies to, e.g. the product title. */
  subtitle?: string
  monthlyBefore: number
  monthlyAfter: number
  oneOffNow?: number
  credit?: number
  settlement?: number
  effectiveFrom?: string
  economics?: LineEconomics & { title?: string }
  note?: string
  confirmLabel?: string
  /** Applies the change. The summary closes itself after calling this. */
  onConfirm: () => void
}

/**
 * A single, consistent "review your change" screen. Every hub action that
 * changes the price routes through this: it shows exactly what happens to the
 * bill (via BillingImpact) and only applies on Confirm. Rendered as a portal
 * overlay (above any open sheet) so it never shifts the page behind it.
 */
export function ChangeSummary({ change, onClose }: { change: PendingChange; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ background: 'rgba(0,0,0,0.72)' }}
    >
      <div className="w-full max-w-lg rounded-t-3xl overflow-hidden flex flex-col" style={{ background: 'var(--color-surface)', maxHeight: '92dvh' }}>
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[var(--color-border-2)]" />
        </div>

        <div className="px-5 pt-2 pb-4 flex-shrink-0 border-b border-[var(--color-border)]">
          <p className="text-[10px] font-bold tracking-widest uppercase mb-0.5" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>Review your change</p>
          <h3 className="text-lg font-black text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>{change.title}</h3>
          {change.subtitle && <p className="text-xs text-[var(--color-muted)] mt-0.5">{change.subtitle}</p>}
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4">
          <BillingImpact
            monthlyBefore={change.monthlyBefore}
            monthlyAfter={change.monthlyAfter}
            oneOffNow={change.oneOffNow}
            credit={change.credit}
            settlement={change.settlement}
            effectiveFrom={change.effectiveFrom}
            economics={change.economics}
            note={change.note}
          />
        </div>

        <div className="px-5 py-4 flex gap-2 flex-shrink-0 border-t border-[var(--color-border)]">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-semibold border border-[var(--color-border)] text-[var(--color-text-2)] active:scale-95 transition-all" style={{ fontFamily: 'var(--font-display)' }}>
            Cancel
          </button>
          <button onClick={() => { change.onConfirm(); onClose() }} className="flex-1 py-3 rounded-2xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all" style={{ fontFamily: 'var(--font-display)' }}>
            {change.confirmLabel ?? 'Confirm change'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
