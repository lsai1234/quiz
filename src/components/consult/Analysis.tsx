'use client'

import { useCallback, useEffect, useState } from 'react'
import { loadCatalogue } from '@/lib/catalogue/load'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { DURATION, chargeTransition, haptic, stateTransition } from '@/lib/consult/motion'
import { chargeProfile } from '@/lib/consult/profile'
import { EmptyStackError, applyToResultsPage, prepareResults, type ResultsBundle } from '@/lib/consult/results'
import { saveHandoffLocally, saveHandoffRemotely } from '@/lib/consult/handoff'
import { visibleScenes, type FlowState } from '@/lib/consult/flow'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { Amp } from './Amp'
import { ChargeProfileChart } from './ChargeProfileChart'
import { Glyph } from './Glyph'
import { NextButton, QuietLink } from './controls'

/**
 * Analysis & charge-up (build H6), and the fully-charged handoff.
 *
 * The one full-screen animation in the consult, so it has to feel earned and
 * never feel slow:
 *
 *   0.0s  the charge profile starts growing from the answers; the stack is
 *         worked out and the results page's data loads in the background
 *   …     four steps tick off, one after another
 *   2.6s  the battery reaches 100%: FULLY CHARGED, Amp bursts, a haptic buzz
 *
 * Nothing waits on the animation and the animation doesn't wait on nothing:
 * it finishes when both the timeline and the data are done, so a slow network
 * shows the last step still working rather than a blank screen. Under reduced
 * motion the steps are ticked as soon as the data is in.
 *
 * Fully charged shows the three stacks and anything that was kept out, and
 * "See my stacks" opens the results page — already loaded.
 */

type LoadProducts = () => Promise<CatalogueProduct[]>

const defaultLoad: LoadProducts = async () => {
  const { products, error } = await loadCatalogue()
  if (!products.length) throw new Error(error ?? 'The catalogue is empty')
  return products
}

interface Props {
  state: FlowState
  onDone: (bundle: ResultsBundle) => void
  onBack: () => void
  /** Where the catalogue comes from — injectable for the workshop and tests. */
  loadProducts?: LoadProducts
}

export function Analysis({ state, onDone, onBack, loadProducts = defaultLoad }: Props) {
  const reduced = useReducedMotion()
  const [bundle, setBundle] = useState<ResultsBundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  /** Quarters of the charge-up elapsed, 0–4. One clock for the battery and the steps. */
  const [clock, setClock] = useState(0)
  const [fill, setFill] = useState(0)

  const answered = visibleScenes(state.answers).filter((s) => s !== 'review').length
  const steps = [
    `Reading ${answered} answers`,
    'Applying your circuit check',
    'Matching against the catalogue',
    'Building three stacks',
  ]

  // The data: engine, payload, adapter, preload.
  useEffect(() => {
    let live = true
    setError(null)
    loadProducts()
      .then((catalogue) => {
        const b = prepareResults(state, catalogue)
        applyToResultsPage(b)
        saveHandoffLocally(b.payload)
        void saveHandoffRemotely(b.payload)
        if (live) setBundle(b)
      })
      .catch((err: unknown) => {
        if (!live) return
        setError(
          err instanceof EmptyStackError
            ? 'Nothing in the shop fits your answers right now. That’s on us, not you.'
            : 'I couldn’t reach the shop just now. Your answers are safe.',
        )
      })
    return () => {
      live = false
    }
  }, [state, loadProducts, attempt])

  // The clock: the battery fills over the charge-up and a step ticks each quarter.
  useEffect(() => {
    if (reduced) {
      setClock(steps.length)
      setFill(1)
      return
    }
    const raf = requestAnimationFrame(() => setFill(1))
    const quarter = DURATION.chargeUp / steps.length
    const timer = setInterval(() => setClock((c) => Math.min(steps.length, c + 1)), quarter)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(timer)
    }
  }, [reduced, steps.length])

  // The last step only ticks once the stack is actually built: a slow network
  // shows "Building three stacks" still working, never a blank screen.
  const ticked = Math.min(clock, bundle ? steps.length : steps.length - 1)
  const full = Boolean(bundle) && clock >= steps.length

  useEffect(() => {
    if (full) haptic('charge')
  }, [full])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  if (error) {
    return (
      <Frame>
        <Amp state="calm" size="md" />
        <h1 className="uppercase" style={titleStyle}>
          Hold that charge
        </h1>
        <p style={{ color: 'var(--amp-ink-2)' }}>{error}</p>
        <NextButton onClick={retry}>Try again</NextButton>
        <QuietLink icon="back" onClick={onBack}>
          Back to my answers
        </QuietLink>
      </Frame>
    )
  }

  return (
    <Frame>
      <p className="text-center uppercase" style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)', color: 'var(--amp-accent)' }}>
        {full ? 'Handing over to your results' : 'Analysing'}
      </p>
      <h1 className="text-center uppercase" style={titleStyle} aria-live="polite">
        {full ? 'Fully charged' : 'Your charge profile'}
      </h1>

      {!full && <ChargeProfileChart profile={chargeProfile(state.answers)} />}

      {!full && (
        <ol className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }} aria-label="Analysis steps">
          {steps.map((label, i) => {
            const done = i < ticked
            return (
              <li key={label} className="flex items-center" style={{ gap: 'var(--amp-space-3)', color: done ? 'var(--amp-ink)' : 'var(--amp-ink-3)', transition: stateTransition('color') }}>
                <span
                  aria-hidden
                  className="flex shrink-0 items-center justify-center"
                  style={{
                    width: 'var(--amp-space-6)',
                    height: 'var(--amp-space-6)',
                    borderRadius: 'var(--amp-radius-pill)',
                    background: done ? 'var(--amp-accent)' : 'transparent',
                    border: `var(--amp-hairline) solid ${done ? 'transparent' : 'var(--amp-edge-strong)'}`,
                    color: 'var(--amp-ink-on-accent)',
                    transition: stateTransition('background-color', 'border-color'),
                  }}
                >
                  {done && <Glyph name="check" size={14} />}
                </span>
                <span>
                  {label}
                  <span className="sr-only">{done ? ', done' : ', working'}</span>
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {/* The battery. */}
      <div className="flex flex-col items-center" style={{ gap: 'var(--amp-space-3)' }}>
        {full ? (
          <Amp state="charged" size="lg" />
        ) : (
          <div
            role="progressbar"
            aria-label="Charge"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((ticked / steps.length) * 100)}
            className="relative"
            style={{
              width: 'calc(var(--amp-space-10) * 3)',
              height: 'calc(var(--amp-space-10) * 1.4)',
              padding: 'var(--amp-space-1)',
              borderRadius: 'var(--amp-radius-tile)',
              border: 'calc(var(--amp-hairline) * 3) solid var(--amp-accent-line)',
            }}
          >
            <div
              className="h-full origin-left"
              style={{
                borderRadius: 'var(--amp-radius-chip)',
                background: 'var(--amp-accent)',
                boxShadow: 'var(--amp-glow)',
                transform: `scaleX(${fill})`,
                transition: chargeTransition('transform'),
              }}
            />
          </div>
        )}
      </div>

      {full && bundle && <Handoff bundle={bundle} onOpen={() => onDone(bundle)} />}
    </Frame>
  )
}

/** Fully charged: the three stacks, what was kept out, and the way through. */
function Handoff({ bundle, onOpen }: { bundle: ResultsBundle; onOpen: () => void }) {
  const title = new Map(bundle.catalogue.map((p) => [p.id, p.shortName || p.title]))
  const tiers: [string, string[]][] = [
    ['Essentials', bundle.payload.tiers.essentials],
    ['Standard', bundle.payload.tiers.standard],
    ['Complete', bundle.payload.tiers.complete],
  ]
  return (
    <div className="flex flex-col amp-anim-rise" style={{ gap: 'var(--amp-space-4)' }}>
      <div
        style={{
          padding: 'var(--amp-space-4)',
          borderRadius: 'var(--amp-radius-panel)',
          border: 'var(--amp-hairline) solid var(--amp-edge-strong)',
          background: 'var(--amp-glass-solid)',
        }}
      >
        {tiers.map(([name, ids], i) => (
          <div key={name} style={{ paddingTop: i ? 'var(--amp-space-3)' : 0, marginTop: i ? 'var(--amp-space-3)' : 0, borderTop: i ? 'var(--amp-hairline) solid var(--amp-edge)' : 'none' }}>
            <p className="flex items-baseline justify-between">
              <span style={{ fontWeight: 'var(--amp-weight-bold)' }}>{name}</span>
              <span style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-data)', color: 'var(--amp-ink-3)' }}>
                {ids.length} products
              </span>
            </p>
            <ul className="flex flex-wrap" style={{ gap: 'var(--amp-space-1)', marginTop: 'var(--amp-space-2)' }}>
              {ids.map((id) => (
                <li key={id} style={{ padding: 'var(--amp-space-1) var(--amp-space-2)', borderRadius: 'var(--amp-radius-chip)', border: 'var(--amp-hairline) solid var(--amp-edge)', fontSize: 'var(--amp-text-meta)' }}>
                  {title.get(id) ?? id}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {bundle.payload.notes.length > 0 && (
        <ul className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }} aria-label="Kept out and skipped">
          {bundle.payload.notes.map((n) => (
            <li key={n} style={{ padding: 'var(--amp-space-3) var(--amp-space-4)', borderRadius: 'var(--amp-radius-tile)', background: 'var(--amp-caution-fill)', color: 'var(--amp-caution)', fontSize: 'var(--amp-text-meta)', lineHeight: 'var(--amp-leading-body)' }}>
              {n}
            </li>
          ))}
        </ul>
      )}
      <NextButton onClick={onOpen}>See my stacks</NextButton>
    </div>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mx-auto flex flex-col justify-center"
      style={{
        maxWidth: 'var(--amp-column)',
        minHeight: 'var(--app-height, 100dvh)',
        padding: 'max(var(--amp-space-6), env(safe-area-inset-top)) var(--amp-gutter) max(var(--amp-space-6), env(safe-area-inset-bottom))',
        gap: 'var(--amp-space-5)',
      }}
    >
      {children}
    </div>
  )
}

const titleStyle = {
  fontFamily: 'var(--amp-font-display)',
  fontWeight: 'var(--amp-weight-heavy)',
  fontSize: 'var(--amp-text-question)',
  lineHeight: 'var(--amp-leading-question)',
} as const
