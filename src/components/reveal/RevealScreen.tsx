'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuizStore } from '@/lib/store'

function ScoreRing({ score }: { score: number }) {
  const [displayed, setDisplayed] = useState(0)
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const targetDash = (score / 100) * circumference

  useEffect(() => {
    // Animate the counter number smoothly
    const start = Date.now()
    const duration = 1200
    const tick = () => {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayed(Math.round(score * eased))
      if (progress < 1) requestAnimationFrame(tick)
    }
    const raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [score])

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
        <circle
          cx="48" cy="48" r={radius}
          fill="none" stroke="var(--color-border)"
          strokeWidth="6"
        />
        <circle
          cx="48" cy="48" r={radius}
          fill="none" stroke="var(--color-accent)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - targetDash}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-2xl font-black text-[var(--color-accent)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {displayed}
        </span>
        <span className="text-[10px] text-[var(--color-muted)] tracking-wider">/100</span>
      </div>
    </div>
  )
}

export function RevealScreen() {
  const router = useRouter()
  const { identity, selectedProducts, aiReasons, stackPersonalised } = useQuizStore()
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    if (!identity) {
      router.replace('/')
      return
    }
    // Staggered reveal phases
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1400),
      setTimeout(() => setPhase(4), 1900),
    ]
    return () => timers.forEach(clearTimeout)
  }, [identity, router])

  if (!identity) return null

  return (
    <main className="flex flex-col min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] overflow-hidden">
      {/* Radial glow behind identity */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 0%, color-mix(in oklch, #cfff32 10%, transparent), transparent)',
        }}
      />

      <div className="relative flex flex-col flex-1 max-w-md mx-auto w-full px-5 pt-14 pb-10">
        {/* Label */}
        <div
          className={`transition-all duration-500 ${phase >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
            <span
              className="text-xs font-semibold tracking-[0.2em] uppercase text-[var(--color-accent)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Your supplement identity
            </span>
            {stackPersonalised && (
              <span
                className="ml-auto px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase text-[var(--color-accent)]"
                style={{
                  fontFamily: 'var(--font-display)',
                  background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
                }}
              >
                ✦ AI personalised
              </span>
            )}
          </div>
        </div>

        {/* Name + archetype */}
        <div
          className={`transition-all duration-600 ${phase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
          style={{ transitionDelay: '0.1s' }}
        >
          <h1
            className="text-5xl font-black leading-tight tracking-tight mt-3"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {identity.name}
          </h1>
          <p className="mt-2 text-base text-[var(--color-accent)] font-semibold">
            {identity.archetype}
          </p>
        </div>

        {/* Description */}
        <div
          className={`mt-6 transition-all duration-500 ${phase >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
          style={{ transitionDelay: '0.05s' }}
        >
          <p className="text-sm text-[var(--color-text-2)] leading-relaxed">
            {identity.description}
          </p>
        </div>

        {/* Focus areas + score */}
        <div
          className={`mt-8 transition-all duration-500 ${phase >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          <div className="flex items-start gap-6">
            {/* Focus areas */}
            <div className="flex-1">
              <p
                className="text-xs font-semibold tracking-widest uppercase text-[var(--color-muted)] mb-3"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Focus areas
              </p>
              <div className="flex flex-wrap gap-2">
                {identity.focusAreas.map((area) => (
                  <span
                    key={area}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-2)]"
                  >
                    {area}
                  </span>
                ))}
              </div>
            </div>

            {/* Routine fit score */}
            <div className="flex flex-col items-center gap-1">
              <ScoreRing score={identity.routineFitScore} />
              <p className="text-[10px] text-[var(--color-muted)] text-center leading-tight max-w-[80px]">
                Routine fit score
              </p>
            </div>
          </div>
        </div>

        {/* Product count teaser */}
        {selectedProducts.length > 0 && (
          <div
            className={`mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-all duration-500 ${phase >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            style={{ transitionDelay: '0.1s' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p
                  className="text-sm font-semibold"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {selectedProducts.length} products selected
                </p>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  {stackPersonalised ? 'Personalised for you by AI' : 'Matched to your goals and budget'}
                </p>
              </div>
              <div className="flex -space-x-2">
                {selectedProducts.slice(0, 3).map((p) => (
                  <div
                    key={p.id}
                    className="w-8 h-8 rounded-full border-2 border-[var(--color-bg)] flex items-center justify-center text-sm"
                    style={{ background: p.accentColor + '22' }}
                  >
                    <span style={{ color: p.accentColor }}>●</span>
                  </div>
                ))}
                {selectedProducts.length > 3 && (
                  <div className="w-8 h-8 rounded-full border-2 border-[var(--color-bg)] bg-[var(--color-surface-2)] flex items-center justify-center text-[10px] text-[var(--color-muted)]">
                    +{selectedProducts.length - 3}
                  </div>
                )}
              </div>
            </div>

            {/* Per-product AI reasoning — only shown when the AI personalised the stack */}
            {selectedProducts.some((p) => aiReasons[p.id]) && (
              <ul className="mt-3 pt-3 flex flex-col gap-2.5 border-t border-[var(--color-border)]">
                {selectedProducts
                  .filter((p) => aiReasons[p.id])
                  .map((p) => (
                    <li key={p.id} className="flex gap-2.5">
                      <span
                        className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: p.accentColor }}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--color-text)]">{p.name}</p>
                        <p className="text-xs text-[var(--color-text-2)] leading-relaxed mt-0.5">
                          {aiReasons[p.id]}
                        </p>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex-1 min-h-8" />

        {/* CTAs */}
        <div
          className={`flex flex-col gap-3 transition-all duration-500 ${phase >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
          style={{ transitionDelay: '0.2s' }}
        >
          <button
            onClick={() => router.push('/stack')}
            className="w-full py-4 rounded-2xl text-base font-bold tracking-wide text-[var(--color-bg)] bg-[var(--color-accent)] transition-all active:scale-95"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            View my stack →
          </button>
          <button
            onClick={() => router.push('/')}
            className="w-full py-3 rounded-2xl text-sm font-medium text-[var(--color-text-2)] active:opacity-60 transition-opacity"
          >
            Start over
          </button>
        </div>
      </div>
    </main>
  )
}
