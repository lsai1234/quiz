import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'

/**
 * An aside — a reassurance, a caveat, a consequence.
 *
 * A glyph in a tinted disc, then the text. The disc is the whole trick: without
 * it a tinted paragraph reads as an error message, which is why both hubs ended
 * up with a dozen coloured boxes that all felt like something had gone wrong.
 *
 * Not a `Card`. A card is a surface things sit on; this is one sentence about
 * the thing next to it, and it should never be mistaken for a container.
 *
 * ── `live` ──────────────────────────────────────────────────────────────────
 * Off by default and deliberately opt-in. Most notes are ambient — they were on
 * screen before the reader arrived — and announcing those interrupts a screen
 * reader mid-sentence.
 *
 * The two settings are not interchangeable. `polite` waits for a pause, which is
 * right for a confirmation: it happened, and it can be heard whenever. `assertive`
 * interrupts, which is right for a failure the member is actively waiting on —
 * a sign-in that did not complete, a payment that was refused. Reaching for
 * `assertive` on an ambient note is how a screen reader ends up talking over
 * itself; reaching for `polite` on a failure is how somebody sits waiting for an
 * answer that already arrived.
 */

type Tone = 'accent' | 'positive' | 'attention' | 'critical' | 'info' | 'neutral'

const FILL: Record<Tone, string> = {
  accent: 'var(--accent-fill)',
  positive: 'var(--positive-fill)',
  attention: 'var(--attention-fill)',
  critical: 'var(--critical-fill)',
  info: 'var(--info-fill)',
  neutral: 'var(--surface-2)',
}

const LINE: Record<Tone, string> = {
  accent: 'var(--accent-line)',
  positive: 'var(--positive-line)',
  attention: 'var(--attention-line)',
  critical: 'var(--critical-line)',
  info: 'var(--info-line)',
  neutral: 'var(--edge)',
}

const INK: Record<Tone, string> = {
  accent: 'var(--accent)',
  positive: 'var(--tone-positive)',
  attention: 'var(--tone-attention)',
  critical: 'var(--tone-critical)',
  info: 'var(--tone-info)',
  neutral: 'var(--ink-3)',
}

export interface NoteProps {
  children: ReactNode
  tone?: Tone
  icon?: IconName
  /**
   * Announce it. Only for a note that appeared because of an action.
   * `polite` for an outcome, `assertive` for a failure being waited on.
   */
  live?: 'polite' | 'assertive'
  className?: string
}

export function Note({ children, tone = 'accent', icon = 'info', live, className }: NoteProps) {
  return (
    <div
      className={`flex items-start ${className ?? ''}`}
      // `alert` rather than `aria-live="assertive"`: the role carries the same
      // politeness and also tells a screen reader what kind of thing it is.
      role={live === 'assertive' ? 'alert' : live === 'polite' ? 'status' : undefined}
      style={{
        gap: 'var(--space-3)',
        background: FILL[tone],
        border: `1px solid ${LINE[tone]}`,
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-3) var(--space-4)',
      }}
    >
      <span
        className="shrink-0 inline-flex items-center justify-center"
        style={{
          width: 'var(--space-6)',
          height: 'var(--space-6)',
          borderRadius: 'var(--radius-pill)',
          background: LINE[tone],
          color: INK[tone],
        }}
      >
        <Icon name={icon} size={13} />
      </span>
      <div
        className="min-w-0"
        style={{ fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-2)' }}
      >
        {children}
      </div>
    </div>
  )
}
