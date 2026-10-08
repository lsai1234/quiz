'use client'

import { Button, Input } from '@/components/system'
import { prizeChip, prizeInline } from '@/lib/competition/prize'
import type { FormEvent } from 'react'

/**
 * The contract every giveaway design implements.
 *
 * Purely presentational: the container (`GiveawayEntry`) owns fetching,
 * storage and submission, and hands a view everything it needs to draw any
 * state. That split is what lets the lab render every state side by side
 * without a network, and lets a redesign swap the view without touching the
 * entry logic.
 */
export interface GiveawayViewProps {
  /** As configured in the Founders Hub, e.g. "Win £200 of supplements". */
  prize: string
  /** A rehearsal: everything must visibly say it is not a real draw. */
  test: boolean
  /** "Closes 30 Nov", or '' when no date is set. */
  closes: string
  /** Extra entries for sharing the card. 10. */
  bonus: number
  /**
   * The person's own giveaway card (a 9:16 poster of their stack, 1080×1920),
   * or null while unavailable. It is the thing they share for the bonus.
   */
  cardImageUrl: string | null
  /** invite: not entered, form closed · form: email form open · entered: done. */
  phase: 'invite' | 'form' | 'entered'
  email: string
  status: 'idle' | 'sending' | 'invalid' | 'closed' | 'error'
  /** They shared the card before entering; the bonus lands when they enter. */
  pendingShare: boolean
  /** Non-null exactly when phase === 'entered'. tickets is 1, or 1 + bonus once shared. */
  entry: { email: string; tickets: number; shared: boolean } | null
  onOpen: () => void
  onEmailChange: (value: string) => void
  onSubmit: (e: FormEvent) => void
  onShare: () => void
}

export function GiveawayEntryView(p: GiveawayViewProps) {
  const { entry, bonus } = p
  return (
    <section
      aria-label="Giveaway"
      className="mx-auto max-w-lg"
      style={{
        marginTop: 'var(--space-5)',
        padding: 'var(--space-4)',
        borderRadius: 'var(--radius-card, 1rem)',
        background: 'color-mix(in srgb, var(--color-accent) 7%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-accent) 28%, transparent)',
      }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-accent)' }}>
          {p.test ? 'Test giveaway' : 'Giveaway'}
        </span>
        <span
          className="text-[9px] font-bold tracking-[.12em] uppercase px-1.5 py-0.5 rounded-full"
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', background: 'color-mix(in srgb, var(--color-accent) 20%, transparent)', color: 'var(--color-accent)' }}
        >
          {p.test ? 'Rehearsal' : prizeChip(p.prize)}
        </span>
      </div>

      {entry ? (
        <div role="status" aria-live="polite">
          <p className="text-lg font-black tracking-tight mt-1.5" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>
            You’re in — {entry.tickets} {entry.tickets === 1 ? 'entry' : 'entries'}
          </p>
          <p className="text-xs leading-relaxed mt-1" style={{ color: 'var(--color-text-2)' }}>
            Entered as <strong style={{ color: 'var(--color-text)' }}>{entry.email}</strong>.{' '}
            {entry.shared ? `That includes ${bonus} bonus entries for sharing your card. Good luck!` : 'We’ll email you if you win.'}
          </p>
          {!entry.shared && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <Button variant="primary" size="lg" icon="share" fullWidth onClick={p.onShare}>
                Share your card for +{bonus} entries
              </Button>
              <p className="text-[11px] leading-snug mt-2 text-center" style={{ color: 'var(--color-muted)' }}>
                Post it to your Instagram story and your {bonus} bonus entries are added.
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="text-lg font-black tracking-tight mt-1.5" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>
            {p.test ? 'Enter the test draw' : `Win ${prizeInline(p.prize)}`}
          </p>
          <p className="text-xs leading-relaxed mt-1" style={{ color: 'var(--color-text-2)' }}>
            You’ve done the quiz — add your email and you’re entered. Share your card to your
            story for <strong style={{ color: 'var(--color-text)' }}>{bonus} bonus entries</strong>.
            {p.pendingShare ? ' You’ve already shared, so they’ll be added as soon as you enter.' : ''}
          </p>
          {p.phase === 'invite' ? (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <Button variant="primary" size="lg" iconRight="chevron-right" fullWidth onClick={p.onOpen}>
                Enter the competition
              </Button>
            </div>
          ) : (
            <form onSubmit={p.onSubmit} noValidate style={{ marginTop: 'var(--space-3)' }} className="flex flex-col gap-3">
              <Input
                label="Your email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off"
                placeholder="you@example.com" value={p.email}
                onChange={(e) => p.onEmailChange(e.target.value)}
                error={p.status === 'invalid' ? 'That doesn’t look like an email address.' : undefined}
              />
              <Button type="submit" variant="primary" size="lg" fullWidth loading={p.status === 'sending'} disabled={p.email.trim().length < 3}>
                {p.status === 'sending' ? 'Entering…' : 'Enter'}
              </Button>
              <p className="text-[11px] leading-snug text-center" style={{ color: 'var(--color-text-2)' }}>
                By entering you agree to the{' '}
                <a href="/legal/competition" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--color-text-2)' }}>competition T&amp;Cs</a>
                , including that getCHRGD can email you offers and news. Unsubscribe any time.
              </p>
              {p.status === 'error' && <p className="text-[11px] text-center" style={{ color: 'var(--tone-critical)' }} role="alert">That didn’t go through — try again in a moment.</p>}
              {p.status === 'closed' && <p className="text-[11px] text-center" style={{ color: 'var(--color-text-2)' }} role="alert">This giveaway has closed.</p>}
            </form>
          )}
        </>
      )}

      <p className="text-[11px] leading-relaxed mt-3 text-center" style={{ color: 'var(--color-muted)' }}>
        {p.test ? 'Test run — no real draw. ' : ''}
        One entry per email{p.closes ? ` · ${p.closes}` : ''} · No purchase necessary ·{' '}
        <a href="/legal/competition" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--color-muted)' }}>T&amp;Cs</a>
        {' · '}
        <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--color-muted)' }}>Privacy</a>
      </p>
    </section>
  )
}
