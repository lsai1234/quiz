'use client'

import { useEffect, useState, type ReactNode, type Ref } from 'react'
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
  const moreBelow = useMoreBelow()

  return (
    <div
      className="mx-auto flex w-full flex-col"
      style={{
        maxWidth: 'var(--amp-column)',
        // Less anything drawn above the consult (the founder preview strip).
        minHeight: 'calc(var(--app-height, 100dvh) - var(--amp-chrome-top, 0px))',
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
      <div style={{ paddingTop: 'var(--amp-shell-lead)' }}>
        {/* Amp gets a line of his own only when he has something to say; on a
            scene with no reaction yet he sits beside the hint instead. */}
        {reaction && (
          <div className="flex items-center" style={{ gap: 'var(--amp-space-2)', minHeight: 'var(--amp-space-6)', marginBottom: 'var(--amp-space-3)' }}>
            {amp}
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
          </div>
        )}

        <h1
          ref={headingRef}
          id={headingId}
          tabIndex={-1}
          className="uppercase"
          style={{
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
        {(hint || (!reaction && amp)) && (
          <div className="flex items-start" style={{ gap: 'var(--amp-space-2)', marginTop: 'var(--amp-space-3)' }}>
            {!reaction && amp}
            {hint && (
              <p style={{ fontSize: 'var(--amp-text-meta)', lineHeight: 'var(--amp-leading-body)', color: 'var(--amp-ink-2)', paddingTop: 'var(--amp-hairline)' }}>{hint}</p>
            )}
          </div>
        )}
      </div>

      {/* ── The interaction ─────────────────────────────────────────────── */}
      <div
        className="flex flex-1 flex-col justify-center"
        style={{ paddingTop: 'var(--amp-shell-gap)', paddingBottom: 'var(--amp-shell-gap)' }}
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
          {moreBelow && (
            <button
              type="button"
              onClick={() => window.scrollBy({ top: Math.round(window.innerHeight * 0.6), behavior: 'smooth' })}
              className="amp-press amp-anim-fade inline-flex items-center self-center uppercase"
              style={{
                gap: 'var(--amp-space-1)',
                minHeight: 'var(--amp-space-8)',
                padding: '0 var(--amp-space-3)',
                borderRadius: 'var(--amp-radius-pill)',
                border: 'var(--amp-hairline) solid var(--amp-accent-line)',
                background: 'var(--amp-glass-solid)',
                color: 'var(--amp-accent)',
                fontFamily: 'var(--amp-font-mono)',
                fontSize: 'var(--amp-text-data)',
                letterSpacing: 'var(--amp-tracking-data)',
              }}
            >
              More below
              <span aria-hidden style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}>
                <Glyph name="next" size={14} />
              </span>
            </button>
          )}
          {action}
          {footer && <div className="flex justify-center">{footer}</div>}
        </footer>
      )}
    </div>
  )
}

/**
 * Whether the scene carries on below the fold. The action bar sits on top of
 * the scroll, so without a cue the last row of a tall scene just looks like
 * the end. Re-checked on scroll, resize, and whenever the page changes size
 * (a card expanding, a sheet of chips appearing).
 */
function useMoreBelow(): boolean {
  const [more, setMore] = useState(false)
  useEffect(() => {
    const el = document.scrollingElement ?? document.documentElement
    const check = () => setMore(el.scrollHeight - (el.scrollTop + window.innerHeight) > 32)
    check()
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null
    ro?.observe(document.body)
    return () => {
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
      ro?.disconnect()
    }
  }, [])
  return more
}
