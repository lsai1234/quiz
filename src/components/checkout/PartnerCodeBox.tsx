'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatGBP } from '@/lib/stack-blueprint/pricing'

const GREEN = '#34d399'
const ACCENT = '#00D4FF'

/** Set by `middleware.ts` when someone arrives on a partner's `?ref=` link. */
const REFERRAL_COOKIE = 'partner_ref'

export interface AppliedCode {
  code: string
  discountPct: number
  partnerName: string
}

interface Props {
  /** Undiscounted order value, so a minimum-spend rule is judged on the real basket. */
  subtotal: number
  applied: AppliedCode | null
  onChange: (applied: AppliedCode | null) => void
}

function cookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

/**
 * The discount-code box.
 *
 * Checks the code as it is entered so someone finds out it works — or exactly
 * why it doesn't — before they commit to paying, rather than after. The answer
 * here is advisory: every checkout re-validates server-side, because between
 * this call and the payment a code can be paused or capped out.
 *
 * A code arriving on a partner's link (`?ref=SARAH20`, banked into a cookie by
 * the middleware) is applied automatically on first render. That is the whole
 * point of the link — the gap between following it and typing a code back in at
 * checkout is where attribution goes missing, and a partner who brought the
 * customer in but earned nothing has a real complaint.
 */
export function PartnerCodeBox({ subtotal, applied, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** So a referral is only auto-applied once, not on every subtotal change. */
  const [triedReferral, setTriedReferral] = useState(false)

  const check = useCallback(
    async (code: string, silent = false) => {
      if (!code.trim()) return
      setChecking(true)
      if (!silent) setError(null)
      try {
        const res = await fetch('/api/partner-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, subtotal }),
        })
        const d = await res.json().catch(() => ({}))
        if (d.ok) {
          onChange({ code: d.code, discountPct: d.discountPct, partnerName: d.partnerName })
          setInput('')
          setError(null)
        } else {
          onChange(null)
          // A referral cookie that no longer works fails quietly — the visitor
          // never typed it, so telling them it is invalid is noise about
          // something they did not do.
          if (!silent) setError(d.reason ?? 'That code didn’t work.')
        }
      } catch {
        if (!silent) setError('Couldn’t check that code — try again.')
      } finally {
        setChecking(false)
      }
    },
    [subtotal, onChange],
  )

  useEffect(() => {
    if (triedReferral || applied) return
    setTriedReferral(true)
    const ref = cookieValue(REFERRAL_COOKIE)
    if (ref) void check(ref, true)
  }, [triedReferral, applied, check])

  if (applied) {
    return (
      <div
        className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5"
        style={{ background: `color-mix(in srgb, ${GREEN} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${GREEN} 25%, transparent)` }}
      >
        <div className="min-w-0">
          <p className="text-[11px] font-bold" style={{ color: GREEN }}>
            {applied.code} · {Math.round(applied.discountPct * 100)}% off
          </p>
          <p className="text-[10px] truncate" style={{ color: 'var(--color-muted)' }}>
            {applied.partnerName}’s code applied
          </p>
        </div>
        <button
          onClick={() => { onChange(null); setError(null) }}
          className="text-[10px] font-semibold underline flex-shrink-0"
          style={{ color: 'var(--color-muted)' }}
        >
          Remove
        </button>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] font-semibold underline self-start"
        style={{ color: 'var(--color-muted)' }}
      >
        Got a discount code?
      </button>
    )
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') void check(input) }}
          placeholder="Discount code"
          autoFocus
          autoCapitalize="characters"
          className="flex-1 px-3 py-2 rounded-xl text-sm outline-none uppercase"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
        />
        <button
          onClick={() => void check(input)}
          disabled={checking || !input.trim()}
          className="text-xs font-bold px-3 py-2 rounded-xl disabled:opacity-40 active:scale-95 transition-all"
          style={{ background: ACCENT, color: 'var(--color-bg)' }}
        >
          {checking ? '…' : 'Apply'}
        </button>
      </div>
      {error && <p className="text-[10px] mt-1.5" style={{ color: 'var(--color-red)' }}>{error}</p>}
      {subtotal > 0 && !error && (
        <p className="text-[10px] mt-1.5" style={{ color: 'var(--color-muted)' }}>
          Checked against your {formatGBP(subtotal)} basket.
        </p>
      )}
    </div>
  )
}
