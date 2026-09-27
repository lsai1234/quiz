'use client'

import type { SceneTell } from '@/lib/consult/flow'
import { Glyph } from './Glyph'
import { QuietLink } from './controls'

/**
 * "Tell Amp more", inside the scene (plan v4 batch 4).
 *
 * Not one link at the foot of every screen: each scene says what it would
 * help to hear, in its own words and with its own example. Where talking is
 * the easier answer (a week that changes, a cupboard of tubs) it leads the
 * screen, above the widget, with an "or set it below" after it; elsewhere it
 * sits under the widget for whatever doesn't fit.
 *
 * What Amp noted is shown back on the screen, and it answers the scene on its
 * own: nobody has to tap the widget as well (see NOTE_ANSWERS).
 */

interface Props {
  tell: SceneTell
  canTalk: boolean
  onOpen: () => void
  /** A second way to say it without typing: the tracker screenshot, where offered. */
  tracker?: () => void
}

/**
 * Leads the screen: the better way to answer here. Kept short on a phone —
 * one card and one line — so the widget still starts above the fold.
 */
export function TellLead({ tell, canTalk, onOpen, tracker }: Props) {
  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-1)', marginBottom: 'var(--amp-space-3)' }}>
      <button
        type="button"
        onClick={onOpen}
        className="amp-press flex w-full items-start text-left"
        style={{
          gap: 'var(--amp-space-3)',
          minHeight: 'var(--amp-target)',
          padding: 'var(--amp-space-3) var(--amp-space-4)',
          borderRadius: 'var(--amp-radius-tile)',
          border: 'var(--amp-hairline) solid var(--amp-accent-line)',
          background: 'var(--amp-accent-fill)',
        }}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span style={{ fontSize: 'var(--amp-text-body)', color: 'var(--amp-ink)' }}>{tell.prompt}</span>
          <span style={{ marginTop: 'var(--amp-space-1)', fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>{tell.example}</span>
        </span>
        <span
          className="flex shrink-0 flex-col items-center"
          style={{ gap: 'var(--amp-space-1)', color: 'var(--amp-accent)', fontFamily: 'var(--amp-font-label)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)' }}
        >
          <Glyph name={canTalk ? 'mic' : 'spark'} size={20} />
          <span className="uppercase">{canTalk ? 'Talk' : 'Type'}</span>
        </span>
      </button>
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 'var(--amp-space-2)' }}>
        {tracker ? (
          <QuietLink icon="camera" onClick={tracker}>
            Fill from my tracker
          </QuietLink>
        ) : (
          <span />
        )}
        <span
          className="uppercase"
          aria-hidden="true"
          style={{ paddingRight: 'var(--amp-space-3)', fontFamily: 'var(--amp-font-label)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)', color: 'var(--amp-ink-3)' }}
        >
          Or set it below
        </span>
      </div>
    </div>
  )
}

/** Under the widget: for whatever doesn't fit it. */
export function TellInline({ tell, canTalk, onOpen, tracker }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-center" style={{ marginTop: 'var(--amp-space-3)', gap: 'var(--amp-space-1)' }}>
      <QuietLink icon={canTalk ? 'mic' : 'spark'} onClick={onOpen}>
        {tell.prompt}
      </QuietLink>
      {tracker && (
        <QuietLink icon="camera" onClick={tracker}>
          Fill from my tracker
        </QuietLink>
      )}
    </div>
  )
}

/** What Amp noted on this screen, shown back — and it counts as the answer. */
export function AmpNoted({ note, onChange }: { note: string; onChange: () => void }) {
  return (
    <div
      role="status"
      className="amp-anim-rise flex items-start"
      style={{
        gap: 'var(--amp-space-3)',
        marginBottom: 'var(--amp-space-4)',
        padding: 'var(--amp-space-3) var(--amp-space-4)',
        borderRadius: 'var(--amp-radius-tile)',
        border: 'var(--amp-hairline) solid var(--amp-accent-line)',
        background: 'var(--amp-glass-solid)',
      }}
    >
      <span className="shrink-0" style={{ color: 'var(--amp-accent)', paddingTop: 'var(--amp-space-1)' }}>
        <Glyph name="check" size={16} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className="uppercase"
          style={{ fontFamily: 'var(--amp-font-label)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)', color: 'var(--amp-ink-3)' }}
        >
          Amp noted · that answers this one
        </span>
        <span style={{ marginTop: 'var(--amp-space-1)', fontSize: 'var(--amp-text-body)', color: 'var(--amp-ink)' }}>{note}</span>
      </span>
      <QuietLink icon="plus" aria-label="Tell Amp more about this" onClick={onChange}>
        More
      </QuietLink>
    </div>
  )
}
