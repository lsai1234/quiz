'use client'

import type { ReactNode, Ref } from 'react'
import { ChargeMeter, chargePercent, type MeterSection } from './ChargeMeter'
import { Glyph } from './Glyph'

/**
 * The full-screen frame every scene drops into (build S5).
 *
 *   ┌───────────────────────────────────────┐
 *   │ ‹  4 / 12 · TRAINING        ▮▮▮▯▯ 38% │  top bar
 *   │                                       │
 *   │ ⚡ Four a week, solid.                 │  Amp + reaction
 *   │ MAP YOUR TRAINING WEEK                │  the question
 *   │ Tap a day to cycle through…           │  hint
 *   │                                       │
 *   │        [ the interaction ]            │  flexes to fill
 *   │                                       │
 *   │ [              Next              ]    │  action bar
 *   │            Tell Amp more              │
 *   └───────────────────────────────────────┘
 *
 * One layout for every scene, so a scene is only ever its interaction. The top
 * bar and the action bar respect the device's safe areas (notch, home
 * indicator); the middle scrolls if a scene is taller than the phone, and the
 * Next button stays put.
 */

export interface SceneShellProps {
  /** 1-based position among the scenes being shown. */
  index: number
  total: number
  /** The section name shown in the data line, e.g. "Training". */
  sectionLabel: string
  meter: MeterSection[]
  currentSectionId: string
  onJump?: (sectionId: string) => void
  /** Hidden on the first scene. */
  onBack?: () => void
  /** Amp himself — the placeholder until the animated one lands. */
  amp?: ReactNode
  /** Amp's reaction to the previous answer. */
  reaction?: string
  question: string
  hint?: string
  /** The scene's interaction. */
  children: ReactNode
  /** The action bar: normally a Next button. */
  action?: ReactNode
  /** Under the action: "Tell Amp more" and similar quiet links. */
  footer?: ReactNode
  /** Given to the question so focus can move to it on arrival (S7). */
  headingRef?: Ref<HTMLHeadingElement>
  headingId?: string
}

export function SceneShell({
  index,
  total,
  sectionLabel,
  meter,
  currentSectionId,
  onJump,
  onBack,
  amp,
  reaction,
  question,
  hint,
  children,
  action,
  footer,
  headingRef,
  headingId,
}: SceneShellProps) {
  const percent = chargePercent(meter)

  return (
    <div
      className="mx-auto flex w-full flex-col"
      style={{
        maxWidth: 'var(--amp-column)',
        minHeight: 'var(--app-height, 100dvh)',
        paddingLeft: 'max(var(--amp-gutter), env(safe-area-inset-left))',
        paddingRight: 'max(var(--amp-gutter), env(safe-area-inset-right))',
      }}
    >
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header
        className="flex items-center"
        style={{
          gap: 'var(--amp-space-3)',
          paddingTop: 'max(var(--amp-space-4), env(safe-area-inset-top))',
          paddingBottom: 'var(--amp-space-2)',
        }}
      >
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="amp-press flex shrink-0 items-center justify-center"
            style={{
              width: 'calc(var(--amp-space-8) + var(--amp-space-1))',
              height: 'calc(var(--amp-space-8) + var(--amp-space-1))',
              borderRadius: 'var(--amp-radius-pill)',
              border: 'var(--amp-hairline) solid var(--amp-edge-strong)',
              background: 'var(--amp-glass)',
              color: 'var(--amp-ink)',
            }}
          >
            <Glyph name="back" size={18} />
          </button>
        ) : (
          <span aria-hidden style={{ width: 'calc(var(--amp-space-8) + var(--amp-space-1))' }} className="shrink-0" />
        )}

        <p
          className="min-w-0 flex-1 truncate uppercase"
          style={{
            fontFamily: 'var(--amp-font-mono)',
            fontSize: 'var(--amp-text-data)',
            letterSpacing: 'var(--amp-tracking-data-tight)',
            color: 'var(--amp-ink-3)',
          }}
        >
          <span className="sr-only">Scene </span>
          {index}/{total} · {sectionLabel}
          <span className="sr-only">, {percent}% charged</span>
        </p>

        {/* No percentage beside the battery here: on a 360px phone it pushes the
            section name into an ellipsis. The level is in the data line for
            screen readers and in the fill for everyone else. */}
        <ChargeMeter sections={meter} currentId={currentSectionId} onJump={onJump} showPercent={false} />
      </header>

      {/* ── Amp, the reaction, the question ─────────────────────────────── */}
      <div style={{ paddingTop: 'var(--amp-space-5)' }}>
        <div className="flex items-center" style={{ gap: 'var(--amp-space-2)', minHeight: 'var(--amp-space-6)' }}>
          {amp}
          {reaction && (
            <p
              aria-live="polite"
              className="uppercase"
              style={{
                fontFamily: 'var(--amp-font-mono)',
                fontSize: 'var(--amp-text-data)',
                letterSpacing: 'var(--amp-tracking-data)',
                color: 'var(--amp-accent)',
              }}
            >
              {reaction}
            </p>
          )}
        </div>

        <h1
          ref={headingRef}
          id={headingId}
          tabIndex={-1}
          className="uppercase"
          style={{
            marginTop: 'var(--amp-space-3)',
            fontFamily: 'var(--amp-font-display)',
            fontWeight: 'var(--amp-weight-heavy)',
            fontSize: 'var(--amp-text-question)',
            lineHeight: 'var(--amp-leading-question)',
            letterSpacing: 'var(--amp-tracking-question)',
            color: 'var(--amp-ink)',
            outline: 'none',
          }}
        >
          {question}
        </h1>
        {hint && (
          <p
            style={{
              marginTop: 'var(--amp-space-3)',
              fontSize: 'var(--amp-text-meta)',
              lineHeight: 'var(--amp-leading-body)',
              color: 'var(--amp-ink-2)',
            }}
          >
            {hint}
          </p>
        )}
      </div>

      {/* ── The interaction ─────────────────────────────────────────────── */}
      <div
        className="flex flex-1 flex-col justify-center"
        style={{ paddingTop: 'var(--amp-space-6)', paddingBottom: 'var(--amp-space-6)' }}
      >
        {children}
      </div>

      {/* ── Action bar ──────────────────────────────────────────────────── */}
      {(action || footer) && (
        <footer
          className="sticky bottom-0 flex flex-col items-stretch"
          style={{
            gap: 'var(--amp-space-2)',
            paddingTop: 'var(--amp-space-3)',
            paddingBottom: 'max(var(--amp-space-5), env(safe-area-inset-bottom))',
            background: 'linear-gradient(to top, var(--amp-ground) 70%, transparent)',
          }}
        >
          {action}
          {footer && <div className="flex justify-center">{footer}</div>}
        </footer>
      )}
    </div>
  )
}
