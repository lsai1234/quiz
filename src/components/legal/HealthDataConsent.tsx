'use client'

import { HEALTH_DATA_VERSION } from '@/lib/legal/versions'
import type { HealthDataConsent as HealthDataConsentRecord } from '@/lib/types'

const ACCENT = '#00D4FF'

/**
 * The Article 9 tick on the safety screen.
 *
 * The screen asks whether someone is pregnant, on prescription medication, or
 * allergic to shellfish. That is special category data, and the only condition
 * available to a supplement retailer is explicit consent — so it is asked for
 * here, on its own control, rather than folded into the subscription tick at
 * checkout three screens later. `docs/DPIA.md` R6 is the risk that separation
 * closes, and it is the reason this cannot become a line in the terms.
 *
 * ── Why it is one line and not a card ───────────────────────────────────────
 * It used to be a bordered panel with an eyebrow, two paragraphs and two
 * full-width buttons, sitting in front of the question and holding the screen
 * hostage until it was answered. That is more ceremony than the decision
 * deserves, and ceremony on a consent control is not neutral: a screen that
 * makes a routine question look like a legal event teaches people to click past
 * legal events.
 *
 * What the law actually asks for here is narrow — an affirmative act, in words,
 * about this processing and nothing else, refusable without losing the service.
 * A single unticked checkbox is all four. So the options are shown immediately
 * and this sits under them, quiet, and Continue works whether or not it is
 * ticked.
 *
 * ── What "unticked" has to mean ─────────────────────────────────────────────
 * Not "collected and ignored" — not collected. The caller is responsible for
 * refusing and dropping the health answers when this is not ticked
 * (`healthDataOptionIds` in the v2 screen, the `safetyFlags` guard in v1), and
 * `sanitiseHealthData` strips them again server-side, because a browser is not
 * where a lawful basis is decided.
 *
 * `onAccept` receives the version so the caller stores what was actually shown;
 * the server re-renders and hashes that document itself when the record is
 * written, so a stale or edited payload cannot manufacture consent.
 */
export function HealthDataConsent({
  consent,
  onAccept,
  onDecline,
  nudge,
}: {
  consent: HealthDataConsentRecord | null | undefined
  onAccept: (version: string) => void
  onDecline: () => void
  /**
   * Somebody just tapped a health option that is not switched on yet.
   *
   * The options are dimmed, so the tap is not a surprise — but "nothing
   * happened" is still the worst answer a control can give, so the row says
   * where the switch is instead of leaving them to work it out.
   */
  nudge?: boolean
}) {
  const accepted = !!consent?.accepted
  const asking = !!nudge && !accepted

  return (
    <div
      className="mt-3.5 px-1 rounded-xl transition-colors duration-300"
      style={asking ? { background: 'rgba(0,212,255,0.06)', boxShadow: '0 0 0 1px rgba(0,212,255,0.25)' } : undefined}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={accepted}
        onClick={() => (accepted ? onDecline() : onAccept(HEALTH_DATA_VERSION))}
        className="flex w-full items-start gap-2.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00D4FF]/40 rounded-lg py-1"
      >
        <span
          aria-hidden
          className="mt-[1px] flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] transition-colors"
          style={
            accepted
              ? { background: ACCENT, border: `1px solid ${ACCENT}` }
              : { background: 'transparent', border: '1px solid rgba(255,255,255,0.28)' }
          }
        >
          {accepted && (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6.2L4.8 8.5L9.5 3.5" stroke="#04121a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <span className={`text-[12px] leading-snug ${asking ? 'text-white/80' : 'text-white/55'}`}>
          Use these to rule products out. That’s health information, so we only use it with your
          say-so — never shared, never used for marketing, never sent to our AI.
        </span>
      </button>

      <p className="text-[11px] leading-snug text-white/30 mt-1 ml-[27px] pb-1">
        {asking ? 'Tick this and the answers above switch on. ' : 'Leave it unticked and we simply don’t ask — you still get a plan. '}
        <a
          href="/legal/health-data"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
          style={{ color: 'rgba(0,212,255,0.75)' }}
        >
          The detail
        </a>
        {' · '}
        <a
          href="/legal/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
          style={{ color: 'rgba(0,212,255,0.75)' }}
        >
          Privacy notice
        </a>
      </p>
    </div>
  )
}

/** The record to store when someone accepts, stamped at the moment they did. */
export function healthDataConsentRecord(version: string): HealthDataConsentRecord {
  return { accepted: true, version, at: new Date().toISOString() }
}
