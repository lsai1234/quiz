'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import type { RedeemChannel } from '@/lib/partners/redeem'
import type { FounderCodeKind } from '@/lib/founder-codes/types'
import { readStarterCode } from '@/lib/partner-starter/handoff'

const GREEN = '#34d399'
const ACCENT = '#00D4FF'

/** Set by `middleware.ts` when someone arrives on a partner's `?ref=` link. */
const REFERRAL_COOKIE = 'partner_ref'

export interface AppliedCode {
  code: string
  discountPct: number
  partnerName: string
  /**
   * Set when the code is one of ours rather than a partner's.
   *
   * The two are the same object to whoever is typing — a code — so they share
   * one box and one endpoint. They are not the same thing on the receipt: a
   * founder code rewrites the prices rather than taking a percentage off them,
   * which is why `discountPct` is 0 on one and why the applied state below
   * reads differently.
   */
  founderKind?: FounderCodeKind | null
  /** What the founder code does, in the server's words. */
  founderLabel?: string | null
  founderNote?: string | null
  /**
   * Set when the code is a partner's own starter stack.
   *
   * A THIRD kind through the same box, and it shares the founder branch's
   * rendering for the same reason it shares its `discountPct: 0`: it sets the
   * price rather than discounting it, so there is no percentage to put on a
   * line. What it is NOT is a founder code — hence its own flag rather than
   * borrowing `founderKind: 'free'`, which would put "Everything free · founder
   * code" in front of a partner and a founder code onto the order.
   */
  starter?: boolean
  starterTier?: string | null
}

interface Props {
  /** Undiscounted order value, so a minimum-spend rule is judged on the real basket. */
  subtotal: number
  /**
   * What is being bought. Codes apply to stacks, curated bundles and
   * subscriptions, not to general shop sales — the server decides, and passing
   * it here just means the answer arrives while they are typing rather than at
   * the payment screen.
   */
  channel?: RedeemChannel
  applied: AppliedCode | null
  onChange: (applied: AppliedCode | null) => void
}

function cookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

/**
 * Forget the referral. Same `path` the middleware set it with, or the browser
 * keeps the original alongside the expired one.
 *
 * This is what makes "Remove" true. The cookie is read SERVER-side too
 * (`resolveCheckoutCode`), as a fallback for screens with no code box — so
 * without this, taking the code off the basket cleared the label and the
 * checkout still went through attributed to the partner, on this purchase and
 * on every purchase for the next thirty days.
 */
function forgetReferral(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${REFERRAL_COOKIE}=; path=/; max-age=0; SameSite=Lax`
}

/**
 * The discount-code box.
 *
 * Checks the code as it is entered so someone finds out it works — or exactly
 * why it doesn't — before they commit to paying, rather than after. The answer
 * here is advisory: every checkout re-validates server-side, because between
 * this call and the payment a code can be paused or capped out.
 *
 * A code arriving on a partner's link (`?ref=SARAH25`, banked into a cookie by
 * the middleware) is applied automatically on first render. That is the whole
 * point of the link — the gap between following it and typing a code back in at
 * checkout is where attribution goes missing, and a partner who brought the
 * customer in but earned nothing has a real complaint.
 */
export function PartnerCodeBox({ subtotal, channel = 'quiz', applied, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** So a referral is only auto-applied once, not on every subtotal change. */
  const [triedReferral, setTriedReferral] = useState(false)
  /**
   * Whether the applied code arrived on a link rather than being typed here.
   * Worth saying out loud: a code someone doesn't remember entering — because
   * they followed the link weeks ago — reads as the site helping itself to a
   * discount decision on their behalf.
   */
  const [fromLink, setFromLink] = useState(false)

  /**
   * `silent` means "nobody typed this" — used for both automatic sources, so
   * neither shouts about a code the visitor never entered. `trusted` separates
   * the two: a starter carried across from our own signing page in this tab is
   * applied, one sitting in a thirty-day cookie anybody can set is not.
   */
  const check = useCallback(
    async (code: string, silent = false, trusted = false) => {
      if (!code.trim()) return
      setChecking(true)
      if (!silent) setError(null)
      try {
        const res = await fetch('/api/partner-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, subtotal, channel }),
        })
        const d = await res.json().catch(() => ({}))
        /*
          A starter stack is NEVER applied from a link, only from typing.

          `/api/cart` refuses to resolve one from the referral cookie
          server-side, and this is the other half of that rule — without it the
          server's guarantee is worthless, because the code arrives in the
          request body either way and the checkout cannot tell how it got
          there.

          The case it prevents: a partner opens `/?ref=PS-…` once, does not
          check out, and buys something ordinary off the quiz three weeks later.
          The cookie is still there, the starter applies itself, and their one
          free stack is silently spent on an order they were happy to pay for.
          That is exactly the "silently, weeks later, on the wrong basket"
          failure the founder codes are kept out of cookies to avoid.
        */
        if (d.ok && d.starter === true && silent && !trusted) return
        if (d.ok) {
          onChange({
            code: d.code,
            discountPct: d.discountPct,
            partnerName: d.partnerName,
            founderKind: d.founderKind ?? null,
            founderLabel: d.label ?? null,
            founderNote: d.note ?? null,
            starter: d.starter === true,
            starterTier: d.starterTier ?? null,
          })
          setFromLink(silent)
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
    [subtotal, channel, onChange],
  )

  useEffect(() => {
    if (triedReferral || applied) return
    setTriedReferral(true)
    /*
      A starter this tab is carrying wins over a referral cookie, and there is
      no contest to be had: the starter is a decision the partner made moments
      ago on our own page, and the cookie is whatever link they last followed.
      Applying the cookie instead would put a partner's free stack behind a 25%
      discount they did not ask for.
    */
    const carried = readStarterCode()
    if (carried) {
      void check(carried, true, true)
      return
    }
    const ref = cookieValue(REFERRAL_COOKIE)
    if (ref) void check(ref, true)
  }, [triedReferral, applied, check])

  if (applied?.founderKind || applied?.starter) {
    // A founder code or a partner's starter stack, applied. Deliberately says
    // what it DOES rather than what it takes off: "100% off" would be a
    // discount line the receipt does not have, and on a cost-price order the
    // delivery goes UP, which no percentage could ever convey.
    return (
      <div
        className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5"
        style={{ background: `color-mix(in srgb, ${ACCENT} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${ACCENT} 25%, transparent)` }}
      >
        <div className="min-w-0">
          <p className="text-[11px] font-bold" style={{ color: ACCENT }}>
            {applied.code} · {applied.founderLabel ?? (applied.starter ? 'Starter stack' : 'Founder code')}
          </p>
          {applied.founderNote && (
            <p className="text-[10px]" style={{ color: 'var(--color-muted)' }}>{applied.founderNote}</p>
          )}
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
          {/* Says out loud that it replaces rather than stacks. Someone who
              expected it on top of the bundle deal should find that out here,
              looking at the receipt, rather than by working backwards from a
              total that is less generous than they had counted on. */}
          <p className="text-[10px]" style={{ color: 'var(--color-muted)' }}>
            {applied.partnerName}’s code — takes {Math.round(applied.discountPct * 100)}% off the regular price, instead of any other discount
          </p>
          {fromLink && (
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-muted)' }}>
              Applied automatically from a link you followed. Remove it to buy without it.
            </p>
          )}
        </div>
        <button
          onClick={() => {
            // Forget the link as well as the label, so it doesn't quietly come
            // back on the next screen — or get picked up server-side anyway.
            forgetReferral()
            setTriedReferral(true)
            setFromLink(false)
            onChange(null)
            setError(null)
          }}
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
