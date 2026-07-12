'use client'

/**
 * Act 1 — question-first instant-start hero.
 *
 * The first interaction IS the quiz: a clear value prop + the quiz's first
 * decision (Performance vs Everyday wellbeing) as two tappable cards, plus the
 * CHRGD LQD card — the all-drinks package. Tapping LQD flips the same two
 * track cards into drinks framing (the track still shapes the questions), so
 * drinks mode costs no extra step. No scroll engine, no pinning, no physics —
 * fast, robust and reduced-motion safe.
 */

import { useState } from 'react'
import { useQuizStore } from '@/lib/store'
import { QuizIcon } from '@/components/quiz/QuizIcon'
import type { QuizTrack } from '@/lib/types'

interface Props {
  onEnterQuiz: () => void
  reducedMotion: boolean
}

const ACCENT = '#00D4FF'

// Wellness leads; the second option ADDS performance on top of wellness rather
// than excluding it — the combined track covers both goal sets.
const TRACKS: { id: QuizTrack; icon: string; label: string; sub: string }[] = [
  { id: 'wellbeing',   icon: 'leaf',     label: 'Everyday wellness',       sub: 'Sleep, stress, focus, immunity — how you feel' },
  { id: 'performance', icon: 'dumbbell', label: 'Performance + wellness',  sub: 'Training goals plus the everyday stuff — the full picture' },
]

/** Same two tracks, poured: shown after tapping the LQD card. Everything in
 *  LQD arrives PRE-MADE — real drinks, zero prep. */
const LQD_TRACKS: { id: QuizTrack; icon: string; label: string; sub: string }[] = [
  { id: 'wellbeing',   icon: 'leaf',     label: 'Drinks for every day',           sub: 'Vitamin drinks, greens, night drinks — ready in the fridge' },
  { id: 'performance', icon: 'dumbbell', label: 'Drinks for training + wellness', sub: 'Pre-mixed shakes, energy cans, shots — plus the everyday drinks' },
]

/** The zero-prep pitch, shown under the LQD track cards. */
const LQD_PITCH = [
  'Every drink arrives ready-made',
  'No powders · no pills · no mixing',
  'Drink what we send — you’re covered',
]

const TRUST = ['~90 seconds', 'No sign-up', 'Built around you']

function CHRGDIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 1.15)} viewBox="0 0 100 115" fill="none">
      <rect x="36" y="1" width="28" height="13" rx="6" fill="white" />
      <rect x="6" y="12" width="88" height="101" rx="28" fill="none" stroke="white" strokeWidth="7" />
      <rect x="19" y="28" width="62" height="13" rx="4" fill="white" />
      <rect x="19" y="48" width="62" height="13" rx="4" fill="white" />
      <path d="M58 22L32 62H51L40 97L76 52H57L58 22Z" fill={ACCENT} />
    </svg>
  )
}

export function Act1Hero({ onEnterQuiz, reducedMotion }: Props) {
  const setAnswer = useQuizStore((s) => s.setAnswer)
  const setGoals = useQuizStore((s) => s.setGoals)
  // LQD card tapped — the two track cards flip to drinks framing.
  const [lqdOpen, setLqdOpen] = useState(false)

  function start(track: QuizTrack, drinksMode = false) {
    setAnswer('track', track)
    setAnswer('drinksMode', drinksMode)
    // Fresh goals/follow-ups for the chosen track; the quiz's goals step then
    // renders the grid directly (no duplicate track chooser).
    setGoals([])
    setAnswer('wellbeingAnswers', {})
    onEnterQuiz()
  }

  return (
    <section className="relative min-h-[100dvh] bg-[#0A0A0A] text-white overflow-hidden flex flex-col">
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 75% 55% at 50% 28%, rgba(0,212,255,0.10), transparent 70%)' }}
      />

      {/* Logo */}
      <header className="relative z-10 flex items-center justify-center gap-2.5 pt-7">
        <CHRGDIcon />
        <span className="font-black text-lg tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>getCHRGD</span>
      </header>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-md mx-auto w-full text-center">
        {/* Ambient bottle — gentle float, disabled for reduced motion */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero/bottle.webp"
          alt=""
          width={132}
          height={198}
          decoding="async"
          fetchPriority="high"
          className="object-contain mb-5"
          style={{
            mixBlendMode: 'screen',
            filter: 'drop-shadow(0 14px 44px rgba(0,212,255,0.28))',
            animation: reducedMotion ? undefined : 'hero-float 6s ease-in-out infinite',
          }}
        />

        {/* Headline + value */}
        <h1 className="text-[2.5rem] sm:text-5xl font-black leading-[1.05] tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          Every body&apos;s different.
          <br />
          <span style={{ color: ACCENT, textShadow: '0 0 28px rgba(0,212,255,0.5)' }}>Build your stack.</span>
        </h1>
        <p className="text-sm text-white/50 mt-4 max-w-sm leading-relaxed">
          Answer a few quick questions and get a supplement stack built around your goals, training and diet.
        </p>

        {/* First question — the quiz starts right here */}
        <p className="text-[11px] font-bold tracking-[0.25em] uppercase mt-9 mb-3" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
          {lqdOpen ? 'CHRGD LQD — what for?' : 'What’s your goal?'}
        </p>
        <div className="w-full flex flex-col gap-3">
          {(lqdOpen ? LQD_TRACKS : TRACKS).map((t) => (
            <button
              key={t.id}
              onClick={() => start(t.id, lqdOpen)}
              className="group w-full flex items-center gap-4 px-5 py-5 rounded-xl border border-white/[0.08] bg-white/[0.015] text-left transition-all duration-200 hover:border-white/20 hover:bg-white/[0.04] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00D4FF]/40"
            >
              <QuizIcon name={t.icon} size={22} className="shrink-0 text-white/45 transition-colors duration-200 group-hover:text-[#00D4FF]" />
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-medium" style={{ fontFamily: 'var(--font-display)' }}>{t.label}</div>
                <div className="text-[13px] mt-1 text-white/40 leading-snug">{t.sub}</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="text-white/25 flex-shrink-0 transition-transform duration-200 group-hover:translate-x-0.5">
                <path d="M8 4L14 10L8 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}

          {/* CHRGD LQD — the all-drinks package */}
          {!lqdOpen ? (
            <button
              onClick={() => setLqdOpen(true)}
              className="group w-full flex items-center gap-4 px-5 py-5 rounded-xl text-left transition-all duration-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00D4FF]/40"
              style={{
                border: `1px solid rgba(0,212,255,0.28)`,
                background: 'linear-gradient(100deg, rgba(0,212,255,0.08), rgba(0,212,255,0.02))',
              }}
            >
              <QuizIcon name="droplet" size={22} className="shrink-0 text-[#00D4FF]" />
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-medium flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
                  CHRGD <span style={{ color: ACCENT }}>LQD</span>
                  <span className="text-[9px] font-bold tracking-[0.18em] uppercase px-1.5 py-0.5 rounded" style={{ color: ACCENT, background: 'rgba(0,212,255,0.12)' }}>New</span>
                </div>
                <div className="text-[13px] mt-1 text-white/40 leading-snug">A month of real, ready-made drinks — no powders, no pills, no mixing.</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="text-white/25 flex-shrink-0 transition-transform duration-200 group-hover:translate-x-0.5">
                <path d="M8 4L14 10L8 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <>
              <div
                className="rounded-xl px-4 py-3 flex flex-col gap-1.5"
                style={{ border: '1px solid rgba(0,212,255,0.18)', background: 'rgba(0,212,255,0.04)' }}
              >
                {LQD_PITCH.map((line) => (
                  <div key={line} className="flex items-center gap-2.5 text-left">
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="flex-shrink-0">
                      <path d="M4 10.5L8.5 15L16 5.5" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-[12px] text-white/60 leading-snug">{line}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setLqdOpen(false)}
                className="text-[12px] text-white/40 underline underline-offset-2 mt-1 self-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00D4FF]/40 rounded"
              >
                ← Back to the full stack builder
              </button>
            </>
          )}
        </div>

        {/* Trust row (honest cues; real social proof can slot in here later) */}
        <div className="flex items-center justify-center gap-2.5 mt-9 flex-wrap">
          {TRUST.map((t, i) => (
            <span key={t} className="inline-flex items-center gap-2.5 text-[11px] text-white/40">
              {i > 0 && <span className="w-1 h-1 rounded-full bg-white/20" />}
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
