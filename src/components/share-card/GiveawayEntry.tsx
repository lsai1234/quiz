'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Button, Checkbox, Input } from '@/components/system'
import { prizeChip, prizeInline, closesLabel } from '@/lib/competition/prize'
import {
  COMPETITION_EVENT, enterByEmail, hasPendingShare, rememberedEntry, type RememberedEntry,
} from '@/lib/competition/client'

/**
 * Entering the giveaway, at the foot of the results page.
 *
 * ── The mechanic ────────────────────────────────────────────────────────────
 * Finish the quiz, leave an email: one entry. Share the card to your story on
 * top: ten more. The quiz is the qualifier, so this lives only where the quiz
 * ends — and the email is the entry, so nobody has to tag anything or come back
 * to type a handle.
 *
 * ── Why it starts as one button ─────────────────────────────────────────────
 * This page's job is checkout. A form sitting open under the plan is a second
 * call to action competing with the first; a button that opens one asks for
 * nothing until somebody has chosen to enter.
 *
 * Renders nothing unless a competition is open — the state is read live, same
 * rule as the card (`docs/SHARE_CARD_BLUEPRINT.md` §3.7).
 */

interface Live {
  state: string
  name: string
  prize: string
  test: boolean
  closesAt: string | null
  shareBonus?: number
}

export function GiveawayEntry({ onShare }: {
  /** Opens the share sheet. Sharing from there is what earns the bonus. */
  onShare: () => void
}) {
  const [comp, setComp] = useState<Live | null>(null)
  const [entry, setEntry] = useState<RememberedEntry | null>(null)
  const [pendingShare, setPendingShare] = useState(false)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [marketing, setMarketing] = useState(false)
  const [status, setStatus] = useState<'idle' | 'sending' | 'invalid' | 'closed' | 'error'>('idle')

  useEffect(() => {
    let live = true
    fetch('/api/competition/enter')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Live | null) => { if (live && d?.state === 'open') setComp(d) })
      .catch(() => {})
    return () => { live = false }
  }, [])

  // The share sheet credits the bonus out of sight of this component, so it
  // listens rather than being told.
  useEffect(() => {
    if (!comp) return
    const sync = () => {
      setEntry(rememberedEntry(comp.name))
      setPendingShare(hasPendingShare(comp.name))
    }
    sync()
    window.addEventListener(COMPETITION_EVENT, sync)
    return () => window.removeEventListener(COMPETITION_EVENT, sync)
  }, [comp])

  if (!comp) return null

  const bonus = comp.shareBonus ?? 10
  const closes = closesLabel(comp.closesAt)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!comp || status === 'sending') return
    setStatus('sending')
    const result = await enterByEmail({ campaign: comp.name, email, marketingOptIn: marketing })
    if (result.ok) {
      setEntry(result.entry)
      setStatus('idle')
      return
    }
    setStatus(result.reason === 'invalid-email' ? 'invalid' : result.reason)
  }

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
        <span
          className="text-[10px] font-bold tracking-[0.18em] uppercase"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-accent)' }}
        >
          {comp.test ? 'Test giveaway' : 'Giveaway'}
        </span>
        <span
          className="text-[9px] font-bold tracking-[.12em] uppercase px-1.5 py-0.5 rounded-full"
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            background: 'color-mix(in srgb, var(--color-accent) 20%, transparent)',
            color: 'var(--color-accent)',
          }}
        >
          {comp.test ? 'Rehearsal' : prizeChip(comp.prize)}
        </span>
      </div>

      {entry ? (
        <div role="status" aria-live="polite">
          <p
            className="text-lg font-black tracking-tight mt-1.5"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
          >
            You’re in — {entry.tickets} {entry.tickets === 1 ? 'entry' : 'entries'}
          </p>
          <p className="text-xs leading-relaxed mt-1" style={{ color: 'var(--color-text-2)' }}>
            Entered as <strong style={{ color: 'var(--color-text)' }}>{entry.email}</strong>.{' '}
            {entry.shared
              ? `That includes ${bonus} bonus entries for sharing your card. Good luck!`
              : 'We’ll email you if you win.'}
          </p>

          {!entry.shared && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <Button variant="primary" size="lg" icon="share" fullWidth onClick={onShare}>
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
          <p
            className="text-lg font-black tracking-tight mt-1.5"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
          >
            {comp.test ? 'Enter the test draw' : `Win ${prizeInline(comp.prize)}`}
          </p>
          <p className="text-xs leading-relaxed mt-1" style={{ color: 'var(--color-text-2)' }}>
            You’ve done the quiz — add your email and you’re entered. Share your card to your
            story for <strong style={{ color: 'var(--color-text)' }}>{bonus} bonus entries</strong>.
            {pendingShare ? ' You’ve already shared, so they’ll be added as soon as you enter.' : ''}
          </p>

          {!open ? (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <Button variant="primary" size="lg" iconRight="chevron-right" fullWidth onClick={() => setOpen(true)}>
                Enter the competition
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate style={{ marginTop: 'var(--space-3)' }} className="flex flex-col gap-3">
              <Input
                label="Your email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (status === 'invalid') setStatus('idle') }}
                error={status === 'invalid' ? 'That doesn’t look like an email address.' : undefined}
              />
              <Checkbox
                label="Also send me offers and news from getCHRGD"
                hint="Optional — you’re entered either way."
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
              />
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={status === 'sending'}
                disabled={email.trim().length < 3}
              >
                {status === 'sending' ? 'Entering…' : 'Enter'}
              </Button>
              {status === 'error' && (
                <p className="text-[11px] text-center" style={{ color: 'var(--tone-critical)' }} role="alert">
                  That didn’t go through — try again in a moment.
                </p>
              )}
              {status === 'closed' && (
                <p className="text-[11px] text-center" style={{ color: 'var(--color-text-2)' }} role="alert">
                  This giveaway has closed.
                </p>
              )}
            </form>
          )}
        </>
      )}

      <p className="text-[11px] leading-relaxed mt-3 text-center" style={{ color: 'var(--color-muted)' }}>
        {comp.test ? 'Test run — no real draw. ' : ''}
        One entry per email{closes ? ` · ${closes}` : ''} · No purchase necessary ·{' '}
        {/* New tab: navigating away from a page with a stack on it is how a
            basket gets abandoned. */}
        <a
          href="/legal/competition"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
          style={{ color: 'var(--color-muted)' }}
        >
          T&amp;Cs
        </a>
        {' · '}
        <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--color-muted)' }}>
          Privacy
        </a>
      </p>
    </section>
  )
}
