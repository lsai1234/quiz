'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import {
  cadenceOptions,
  computeCadenceImpact,
  computeRemoveImpact,
  oneOffCharge,
  formatDispatchDate,
  effectiveNextDispatch,
} from '@/lib/recharge/mock'
import type { MemberSubscription, MemberSubscriptionLine } from '@/lib/recharge/types'

const ACCENT = '#00D4FF'
const GREEN = '#34d399'
const AMBER = '#fbbf24'

interface Props {
  subscription: MemberSubscription
  line: MemberSubscriptionLine
  onSetCadence: (months: number) => void
  onSkip: () => void
  onExpedite: (qty: number) => void
  onRemove: () => void
  onClose: () => void
}

function cadenceLabel(months: number): string {
  return months === 1 ? 'Every month' : `Every ${months} months`
}

export function LineManageSheet({ subscription, line, onSetCadence, onSkip, onExpedite, onRemove, onClose }: Props) {
  const [mounted, setMounted] = useState(false)
  const [months, setMonths] = useState(line.deliveryIntervalMonths)
  const [confirmRemove, setConfirmRemove] = useState(false)

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

  const options = cadenceOptions()
  const cadenceImpact = computeCadenceImpact(subscription, line.id, months)
  const cadenceChanged = months !== line.deliveryIntervalMonths
  const removeImpact = computeRemoveImpact(subscription, line.id)
  const oneOff = oneOffCharge(line, 1)
  const nextBox = formatDispatchDate(effectiveNextDispatch(subscription))

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ background: 'rgba(0,0,0,0.72)' }}
    >
      <div className="w-full max-w-lg rounded-t-3xl overflow-hidden flex flex-col" style={{ background: 'var(--color-surface)', maxHeight: '90dvh' }}>
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[var(--color-border-2)]" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-4 flex items-start justify-between gap-3 flex-shrink-0 border-b border-[var(--color-border)]">
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase mb-0.5" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
              {line.slotTitle}
            </p>
            <h3 className="text-lg font-black text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Manage {line.productTitle}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-muted)] bg-[var(--color-surface-2)] active:scale-90 flex-shrink-0 mt-0.5" aria-label="Close">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Cadence — going faster / slower */}
          <div>
            <p className="text-sm font-bold text-[var(--color-text)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>How often should it ship?</p>
            <p className="text-xs text-[var(--color-muted)] mb-3">Going through it faster? Ship more often. Stockpiling? Ship less often — you only pay for what ships.</p>
            <div className="flex flex-wrap gap-2">
              {options.map((m) => {
                const active = months === m
                return (
                  <button
                    key={m}
                    onClick={() => setMonths(m)}
                    className="px-3.5 h-10 rounded-xl text-xs font-bold transition-all active:scale-95"
                    style={{
                      background: active ? 'var(--color-accent)' : 'var(--color-surface-2)',
                      color: active ? 'var(--color-bg)' : 'var(--color-text-2)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    {cadenceLabel(m)}
                  </button>
                )
              })}
            </div>
            {cadenceChanged && (
              <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 flex items-center justify-between text-sm">
                <span className="text-[var(--color-text-2)]">Monthly</span>
                <span className="font-bold text-[var(--color-text)]">
                  {formatGBP(cadenceImpact.currentMonthly)} → <span style={{ color: ACCENT }}>{formatGBP(cadenceImpact.newMonthly)}</span>
                </span>
              </div>
            )}
            {cadenceChanged && (
              <button
                onClick={() => onSetCadence(months)}
                className="mt-2 w-full py-3 rounded-xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Save cadence
              </button>
            )}
          </div>

          {/* Quick moves */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onExpedite(1)}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3.5 text-left active:scale-[0.98] transition-all"
            >
              <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Get one now</p>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">One-off {formatGBP(oneOff)} · ships ASAP</p>
            </button>
            <button
              onClick={onSkip}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3.5 text-left active:scale-[0.98] transition-all"
            >
              <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Skip next</p>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">Credit {formatGBP(line.pricePerDelivery)} to next payment</p>
            </button>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] -mt-2">Next box: {nextBox}.</p>

          {/* Remove */}
          <div className="pt-1">
            {!confirmRemove ? (
              <button
                onClick={() => setConfirmRemove(true)}
                className="w-full py-3 rounded-2xl text-sm font-semibold border border-[var(--color-border)] text-[var(--color-muted)] active:scale-95 transition-all"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Remove from stack
              </button>
            ) : (
              <div className="rounded-2xl border p-4" style={{ borderColor: `color-mix(in srgb, ${AMBER} 40%, transparent)`, background: `color-mix(in srgb, ${AMBER} 6%, transparent)` }}>
                <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Remove {line.productTitle}?</p>
                {removeImpact.settlement > 0.01 ? (
                  <p className="text-xs text-[var(--color-text-2)] mt-1 leading-relaxed">
                    A one-off settlement of <span className="font-bold" style={{ color: AMBER }}>{formatGBP(removeImpact.settlement)}</span> applies — it covers the box already sent that you haven&apos;t finished paying for. Your monthly drops to {formatGBP(removeImpact.newMonthly)}.
                  </p>
                ) : (
                  <p className="text-xs text-[var(--color-text-2)] mt-1 leading-relaxed">
                    Nothing&apos;s shipped yet, so there&apos;s no charge. Your monthly drops to <span className="font-bold" style={{ color: GREEN }}>{formatGBP(removeImpact.newMonthly)}</span>.
                  </p>
                )}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setConfirmRemove(false)} className="flex-1 py-2.5 rounded-xl text-xs font-semibold border border-[var(--color-border)] text-[var(--color-text-2)] active:scale-95" style={{ fontFamily: 'var(--font-display)' }}>Keep it</button>
                  <button onClick={onRemove} className="flex-1 py-2.5 rounded-xl text-xs font-bold active:scale-95" style={{ background: AMBER, color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}>Remove</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
