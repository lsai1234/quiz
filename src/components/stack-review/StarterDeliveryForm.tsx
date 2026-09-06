'use client'

import { useState } from 'react'
import type { SupplierAddress } from '@/lib/supplier/types'

interface Props {
  /** Prefilled from the agreement they signed, so the common case is one tap. */
  defaultName?: string | null
  busy?: boolean
  error?: string | null
  onCancel: () => void
  onSubmit: (address: SupplierAddress) => void
}

const field: React.CSSProperties = {
  width: '100%',
  padding: '0.7rem 0.85rem',
  borderRadius: '0.75rem',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text)',
  fontSize: '0.875rem',
}

const label: React.CSSProperties = {
  display: 'block',
  fontSize: '0.6875rem',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-muted)',
  marginBottom: '0.3rem',
}

/**
 * Where a free stack is going.
 *
 * ── Why this screen has to exist ────────────────────────────────────────────
 * Every other checkout collects the address at Stripe. A £0.00 order never
 * reaches Stripe — there is nothing for it to take — so nothing asks, and the
 * first version of this journey raised every claimed order with no address and
 * no email. The fulfilment queue held them all as unshippable, and the only way
 * to send a box was to message the partner and type it in by hand.
 *
 * ── Why it is here and not on the signing page ──────────────────────────────
 * Because an address given before the quiz is an address collected from people
 * who then abandon it, and because this is where anybody buying anything expects
 * to be asked. It is the last step, and it is the only form in the journey.
 *
 * ── Why the email is required rather than optional ──────────────────────────
 * Two reasons that both bite later. It is where the order confirmation goes —
 * a free box with no confirmation is a partner wondering whether it worked —
 * and PowerBody require an email or a phone on every order, because couriers
 * send the recipient a verification code. The server enforces the same rule
 * (`normaliseShippingAddress`); asking here means finding out now rather than
 * at the moment of pressing the button.
 */
export function StarterDeliveryForm({ defaultName, busy, error, onCancel, onSubmit }: Props) {
  const [name, setName] = useState(defaultName?.trim() ?? '')
  const [line1, setLine1] = useState('')
  const [line2, setLine2] = useState('')
  const [city, setCity] = useState('')
  const [postcode, setPostcode] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const ready =
    name.trim().length > 1 &&
    line1.trim().length > 2 &&
    city.trim().length > 1 &&
    postcode.trim().length > 4 &&
    email.trim().includes('@')

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!ready || busy) return
        onSubmit({
          name: name.trim(),
          line1: line1.trim(),
          line2: line2.trim() || null,
          city: city.trim(),
          postcode: postcode.trim(),
          country: 'GB',
          email: email.trim(),
          phone: phone.trim() || null,
        })
      }}
      className="rounded-2xl p-4 mt-3"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <p className="text-sm font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        Where shall we send it?
      </p>
      <p className="text-[11px] leading-relaxed mt-1" style={{ color: 'var(--color-muted)' }}>
        Nothing to pay — we just need somewhere to send the box and an email for your confirmation.
      </p>

      <div className="grid gap-3 mt-4">
        <div>
          <label style={label} htmlFor="sd-name">Full name</label>
          <input id="sd-name" style={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
        <div>
          <label style={label} htmlFor="sd-line1">Address</label>
          <input
            id="sd-line1"
            style={field}
            value={line1}
            onChange={(e) => setLine1(e.target.value)}
            autoComplete="address-line1"
            placeholder="House number and street"
          />
        </div>
        <div>
          <label style={label} htmlFor="sd-line2">Address line 2 <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
          <input id="sd-line2" style={field} value={line2} onChange={(e) => setLine2(e.target.value)} autoComplete="address-line2" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={label} htmlFor="sd-city">Town or city</label>
            <input id="sd-city" style={field} value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
          </div>
          <div>
            <label style={label} htmlFor="sd-postcode">Postcode</label>
            <input
              id="sd-postcode"
              style={field}
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              autoComplete="postal-code"
              autoCapitalize="characters"
            />
          </div>
        </div>
        <div>
          <label style={label} htmlFor="sd-email">Email</label>
          <input id="sd-email" style={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div>
          <label style={label} htmlFor="sd-phone">Phone <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
          <input id="sd-phone" style={field} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          <p className="text-[10px] leading-snug mt-1" style={{ color: 'var(--color-muted)' }}>
            Couriers text a delivery code — worth adding if you can.
          </p>
        </div>
      </div>

      {error && (
        <p className="text-[11px] leading-relaxed mt-3" style={{ color: 'var(--tone-critical, #ef4444)' }}>
          {error}
        </p>
      )}

      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all active:scale-95"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          Back
        </button>
        <button
          type="submit"
          disabled={!ready || busy}
          className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
          style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
        >
          {busy ? 'Placing your order…' : 'Place my free order'}
        </button>
      </div>
    </form>
  )
}
