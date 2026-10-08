'use client'

import { GiveawayEntryView, type GiveawayViewProps } from '@/components/share-card/GiveawayEntryView'

/**
 * Every state of the giveaway ticket, each in its own phone-width frame, so it
 * can be reviewed without finishing a quiz or switching a real draw on.
 * `[data-state]` marks each frame for screenshots.
 */

const noop = () => {}

const BASE: GiveawayViewProps = {
  prize: 'Win £200 of supplements',
  test: false,
  closes: 'Closes 30 Nov',
  bonus: 10,
  cardImageUrl: null,
  phase: 'invite',
  email: '',
  status: 'idle',
  pendingShare: false,
  entry: null,
  onOpen: noop,
  onEmailChange: noop,
  onSubmit: (e) => e.preventDefault(),
  onShare: noop,
}

const STATES: Array<[string, Partial<GiveawayViewProps>]> = [
  ['invite', {}],
  ['invite-pending', { pendingShare: true }],
  ['invite-test', { test: true, prize: 'Win £200 of supplements' }],
  ['form', { phase: 'form' }],
  ['form-filled', { phase: 'form', email: 'sam@example.com' }],
  ['form-invalid', { phase: 'form', email: 'sam@', status: 'invalid' }],
  ['form-sending', { phase: 'form', email: 'sam@example.com', status: 'sending' }],
  ['form-error', { phase: 'form', email: 'sam@example.com', status: 'error' }],
  ['entered', { phase: 'entered', entry: { email: 'sam@example.com', tickets: 1, shared: false } }],
  ['entered-shared', { phase: 'entered', entry: { email: 'sam@example.com', tickets: 11, shared: true } }],
]

export function Board({ thumb }: { thumb: string }) {
  return (
    <main style={{ background: 'var(--color-bg)', minHeight: '100vh', padding: '24px 0 80px' }}>
      {/* The bottom of the results page as it really reads: the safety small
          print, then the ticket (the share tile stands down while a draw is open). */}
      <div data-state="context" style={{ width: 390, margin: '0 auto 48px', background: 'var(--color-bg)', padding: '20px 20px 32px' }}>
        <p className="text-[11px] leading-relaxed text-center" style={{ color: 'var(--color-muted)' }}>
          Food supplements are not a substitute for a varied diet or medical care. Consult your GP
          before use if you are pregnant, breastfeeding, or taking prescribed medication (including HRT).
        </p>
        <GiveawayEntryView {...BASE} cardImageUrl={thumb} />
      </div>

      {STATES.map(([name, patch]) => (
        <div key={name} style={{ width: 390, margin: '0 auto 40px' }}>
          <p style={{ color: 'var(--color-muted)', fontSize: 11, fontFamily: 'monospace', padding: '0 20px 6px' }}>{name}</p>
          <div data-state={name} style={{ background: 'var(--color-bg)', padding: '12px 20px 20px' }}>
            <GiveawayEntryView {...BASE} cardImageUrl={thumb} {...patch} />
          </div>
        </div>
      ))}
    </main>
  )
}
