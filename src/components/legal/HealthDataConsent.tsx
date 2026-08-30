'use client'

import { HEALTH_DATA_VERSION } from '@/lib/legal/content'
import type { HealthDataConsent as HealthDataConsentRecord } from '@/lib/types'

const ACCENT = '#00D4FF'

/**
 * The Article 9 gate on the safety screen.
 *
 * The screen behind this asks whether someone is pregnant, on prescription
 * medication, or allergic to shellfish. That is special category data, and the
 * only condition available to a supplement retailer is explicit consent — so it
 * is taken here, before the questions are shown, rather than folded into the
 * subscription tick at checkout three screens later.
 *
 * Two things make it explicit rather than implied:
 *
 *  • The options do not exist until it is given. Declining is not a smaller set
 *    of answers, it is no health data collected at all — which is the only
 *    version of "optional" that means anything.
 *  • It is a deliberate affirmative action on its own control, unticked by
 *    default, describing this processing and nothing else.
 *
 * `onAccept` receives the version so the caller stores what was actually
 * displayed; the server re-renders and hashes that document itself when the
 * record is written, so a stale or edited payload cannot manufacture consent.
 */
export function HealthDataConsent({
  consent,
  onAccept,
  onDecline,
}: {
  consent: HealthDataConsentRecord | null | undefined
  onAccept: (version: string) => void
  onDecline: () => void
}) {
  const accepted = !!consent?.accepted

  if (accepted) {
    return (
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="text-[11px] text-white/40 leading-snug">
          You’ve agreed we can use these answers to rule products out.
        </span>
        <button
          type="button"
          onClick={onDecline}
          className="text-[11px] underline underline-offset-2 shrink-0"
          style={{ color: ACCENT }}
        >
          Undo
        </button>
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl p-4 mb-4"
      style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
    >
      <p
        className="text-[10px] font-bold tracking-widest uppercase mb-2"
        style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}
      >
        Before we ask
      </p>
      <p className="text-[12px] leading-relaxed text-[var(--color-text-2)]">
        The next question asks about pregnancy, medication and allergies. That’s health
        information, so we need your say-so before we use it — only ever to leave out products
        that aren’t right for you. It’s never shared, never used for marketing, and never sent to
        our AI.
      </p>
      <p className="text-[12px] leading-relaxed text-[var(--color-text-2)] mt-2">
        You can skip it and still get a plan. You can also change your mind later from your
        account.{' '}
        <a
          href="/legal/health-data"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
          style={{ color: ACCENT }}
        >
          The detail
        </a>
        {' · '}
        <a
          href="/legal/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
          style={{ color: ACCENT }}
        >
          Privacy notice
        </a>
      </p>

      <div className="flex flex-col gap-2 mt-4 sm:flex-row">
        <button
          type="button"
          onClick={() => onAccept(HEALTH_DATA_VERSION)}
          className="flex-1 rounded-xl px-4 py-3 text-[13px] font-semibold transition-opacity hover:opacity-90"
          style={{ background: ACCENT, color: '#04121a' }}
        >
          Yes — use my answers to rule things out
        </button>
        <button
          type="button"
          onClick={onDecline}
          className="flex-1 rounded-xl px-4 py-3 text-[13px] font-semibold text-[var(--color-text-2)] transition-colors hover:text-white"
          style={{ border: '1px solid var(--color-border)' }}
        >
          Skip this
        </button>
      </div>
    </div>
  )
}

/** The record to store when someone accepts, stamped at the moment they did. */
export function healthDataConsentRecord(version: string): HealthDataConsentRecord {
  return { accepted: true, version, at: new Date().toISOString() }
}
