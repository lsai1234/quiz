'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BeforeDashboard } from './BeforeDashboard'
import { AfterDashboard } from './AfterDashboard'

/**
 * My Hub's dashboard, both ways, on one page.
 *
 * A styleguide cannot answer "does this look better" — nobody can prefer a
 * component gallery, and nobody can attempt a task in one. This is the smallest
 * artefact that makes a real answer possible: the same screen, the same data,
 * the same words, rendered in the current design and in the new one.
 *
 * ── The URL is the interface ────────────────────────────────────────────────
 *   /styleguide/compare              both, side by side
 *   /styleguide/compare?v=before     one arm, full bleed — for a preference test
 *   /styleguide/compare?v=after
 *   /styleguide/compare?blind=1      labels them A and B instead of before/after
 *   /styleguide/compare?blind=1&swap=1   puts the new one on the left
 *
 * `blind` matters more than it looks. Told which one is "after", people tell you
 * they prefer the new thing — they are answering "did you work hard", not "which
 * would you rather use". Send the blind link, and swap the order for half your
 * respondents so left-hand bias cancels out.
 *
 * ── What is deliberately not here ───────────────────────────────────────────
 * Sheets, the check-in, the settings disclosure. Both arms are the resting
 * screen. That is the honest scope for a first-impression test, and it is also
 * the scope where a preference result means anything: once someone is three taps
 * into a flow they are judging the flow, not the design.
 */

const FRAME_WIDTH = 390

export function ComparePage() {
  const params = useSearchParams()
  const view = params.get('v')
  const blind = params.get('blind') === '1'
  const swap = params.get('swap') === '1'

  const before = {
    key: 'before',
    label: blind ? 'A' : 'Before — today’s My Hub',
    node: <BeforeDashboard />,
  }
  const after = {
    key: 'after',
    label: blind ? 'B' : 'After — the design system',
    node: <AfterDashboard />,
  }

  if (view === 'before') return <FullBleed>{before.node}</FullBleed>
  if (view === 'after') return <FullBleed>{after.node}</FullBleed>

  const [left, right] = swap ? [after, before] : [before, after]

  return (
    <div className="min-h-screen" style={{ background: '#0b0b0f' }}>
      <header
        className="px-5 py-4 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <h1
          className="text-base font-black"
          style={{ color: '#f4f6fb', fontFamily: 'var(--font-display)' }}
        >
          My Hub — design comparison
        </h1>
        <p className="text-xs mt-1 leading-relaxed" style={{ color: '#a2a8b4', maxWidth: '46rem' }}>
          The same screen, the same data, the same words. Only the design differs — a test
          asserts both sides render identical text, so a preference here is a preference
          about the look and nothing else.
        </p>
        <nav className="flex flex-wrap gap-2 mt-3 text-xs" style={{ color: '#a2a8b4' }}>
          <Crumb href="/styleguide/compare" active={!blind && !view}>Side by side</Crumb>
          <Crumb href="/styleguide/compare?blind=1" active={blind && !swap}>Blind (A/B)</Crumb>
          <Crumb href="/styleguide/compare?blind=1&swap=1" active={blind && swap}>Blind, swapped</Crumb>
          <Crumb href="/styleguide/compare?v=before">Before only</Crumb>
          <Crumb href="/styleguide/compare?v=after">After only</Crumb>
          <Crumb href="/styleguide">Styleguide</Crumb>
        </nav>
      </header>

      <div className="flex flex-wrap gap-8 justify-center p-8">
        {[left, right].map((arm) => (
          <section key={arm.key} style={{ width: FRAME_WIDTH }}>
            <h2
              className="text-xs font-bold uppercase tracking-widest mb-3 text-center"
              style={{ color: '#a2a8b4', fontFamily: 'var(--font-display)' }}
            >
              {arm.label}
            </h2>
            {/* A fixed 390px column with its own scroll, so both arms are judged
                at the width My Hub is actually used at — a phone. */}
            <div
              className="overflow-y-auto rounded-2xl"
              style={{
                height: '80vh',
                border: '1px solid rgba(255,255,255,0.12)',
                // Isolates each arm's `position: fixed` layers — the new one's
                // ground is fixed to the viewport, and without this it would
                // paint across the whole page instead of inside its frame.
                contain: 'paint',
              }}
            >
              {arm.node}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

/** One arm alone, at full viewport — the link you send to a test participant. */
function FullBleed({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen">{children}</div>
}

function Crumb({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-2.5 py-1 rounded-lg"
      style={{
        background: active ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.06)',
        color: active ? '#00d4ff' : '#c3c8d2',
        border: `1px solid ${active ? 'rgba(0,212,255,0.35)' : 'rgba(255,255,255,0.09)'}`,
      }}
    >
      {children}
    </Link>
  )
}
