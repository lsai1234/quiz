'use client'

import { CHECKOUT_DISCLAIMER_POINTS } from '@/lib/legal/content'

const ACCENT = '#00D4FF'

/**
 * The health disclaimer and consent tick-box shown at checkout.
 *
 * Both live in one component on purpose. The disclaimer has to be read to mean
 * anything, and a checkbox sitting directly under it — rather than a link to
 * terms three taps away — is the difference between informed consent and a
 * formality. The points are rendered from `CHECKOUT_DISCLAIMER_POINTS`, so this
 * can never drift from what the disclaimer page and the emails say.
 */
export function CheckoutConsent({
  accepted,
  onChange,
  error,
}: {
  accepted: boolean
  onChange: (accepted: boolean) => void
  error?: string | null
}) {
  return (
    <div className="mt-5">
      <div
        className="rounded-2xl p-4 mb-3"
        style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
      >
        <p
          className="text-[10px] font-bold tracking-widest uppercase mb-2"
          style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}
        >
          Before you subscribe
        </p>
        <ul className="space-y-2">
          {CHECKOUT_DISCLAIMER_POINTS.map((point, i) => (
            <li key={i} className="text-[11px] leading-relaxed text-[var(--color-text-2)] flex gap-2">
              <span aria-hidden="true" style={{ color: ACCENT }}>
                •
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>

      <label className="flex gap-3 items-start cursor-pointer px-1">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 flex-shrink-0"
          style={{ accentColor: ACCENT }}
          aria-describedby={error ? 'consent-error' : undefined}
        />
        <span className="text-[11px] leading-relaxed text-[var(--color-text-2)]">
          I’ve read and agree to the{' '}
          <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: ACCENT }}>
            subscription terms
          </a>{' '}
          — including that prices can change with notice, and what happens if a product becomes
          unavailable — and the{' '}
          <a href="/legal/disclaimer" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: ACCENT }}>
            health and allergen information
          </a>
          .
        </span>
      </label>

      {error && (
        <p id="consent-error" role="alert" className="text-xs font-semibold mt-2 px-1" style={{ color: '#ff6b6b' }}>
          {error}
        </p>
      )}
    </div>
  )
}
