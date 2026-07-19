'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useQuizStore } from '@/lib/store'
import { StackReviewPage } from '@/components/stack-review/StackReviewPage'
import { QuizIcon } from '@/components/quiz/QuizIcon'
import { focusAreaGlyph } from '@/lib/identity-visuals'

gsap.registerPlugin(ScrollTrigger)

interface Props {
  reducedMotion: boolean
}

function ScoreRing({ score }: { score: number }) {
  const numRef = useRef<HTMLSpanElement>(null)
  const r = 36
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ

  useEffect(() => {
    const counter = { val: 0 }
    const t = setTimeout(() => {
      gsap.to(counter, {
        val: score,
        duration: 1.4,
        ease: 'power2.out',
        onUpdate: () => {
          if (numRef.current) numRef.current.textContent = Math.round(counter.val).toString()
        },
      })
    }, 600)
    return () => clearTimeout(t)
  }, [score])

  return (
    <div className="relative w-20 h-20 flex items-center justify-center">
      <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(10,10,10,0.1)" strokeWidth="4" />
        <circle cx="40" cy="40" r={r} fill="none" stroke="#00D4FF" strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ}
          style={{ filter: 'drop-shadow(0 0 4px rgba(0,212,255,0.5))' }}
          ref={(el) => {
            if (!el) return
            setTimeout(() => {
              el.style.transition = 'stroke-dashoffset 1.3s cubic-bezier(0.22,1,0.36,1)'
              el.style.strokeDashoffset = String(circ - dash)
            }, 600)
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span ref={numRef} className="text-xl font-black text-[#0A0A0A]" style={{ fontFamily: 'var(--font-display)' }}>
          0
        </span>
        <span className="text-[9px] text-[#0A0A0A]/40">/100</span>
      </div>
    </div>
  )
}

export function Act4Reveal({ reducedMotion }: Props) {
  const { identity, answers } = useQuizStore()
  const firstName = answers.name?.split(' ')[0]?.trim() || null
  const headlineRef = useRef<HTMLDivElement>(null)
  const [descExpanded, setDescExpanded] = useState(false)

  // Headline — spring-loaded reveal
  useEffect(() => {
    if (!headlineRef.current || reducedMotion) return
    const words = headlineRef.current.querySelectorAll('[data-word]')
    gsap.fromTo(
      words,
      { y: 40, opacity: 0, scale: 0.92 },
      { y: 0, opacity: 1, scale: 1, stagger: 0.09, duration: 0.6, ease: 'back.out(1.4)', delay: 0.15 },
    )
  }, [reducedMotion])

  if (!identity) return null

  return (
    <div className="bg-[#F5F5F0] min-h-screen pb-10">
      {/* Identity header — a poster-style reveal card */}
      <div className="px-5 pt-14 pb-10 max-w-lg mx-auto">
        <div
          ref={headlineRef}
          className="rounded-3xl p-6"
          style={{
            background: 'linear-gradient(180deg, rgba(0,212,255,0.07), rgba(255,255,255,0) 42%), #FFFFFF',
            border: '1px solid rgba(10,10,10,0.07)',
            boxShadow: '0 22px 54px -26px rgba(10,10,10,0.28)',
          }}
        >
          {/* Top row — status badge + routine-fit score, the two hero elements */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span
                data-word
                className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.18em] uppercase px-2.5 py-1 rounded-full"
                style={{ fontFamily: 'var(--font-display)', color: '#00D4FF', background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)' }}
              >
                ⚡ Fully charged
              </span>
              <span
                className="text-[10px] font-bold tracking-[0.25em] uppercase text-[#00D4FF] mt-3 block"
                data-word style={{ fontFamily: 'var(--font-display)' }}
              >
                {firstName ? `${firstName}'s supplement identity` : 'Your supplement identity'}
              </span>
            </div>
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <ScoreRing score={identity.routineFitScore} />
              <p className="text-[9px] font-semibold text-[#0A0A0A]/35 text-center max-w-[72px] leading-tight">
                Routine fit
              </p>
            </div>
          </div>

          {/* Name — the focal point */}
          <h2
            className="text-[2.75rem] font-black leading-[1.02] tracking-tight text-[#0A0A0A] mt-4"
            data-word style={{ fontFamily: 'var(--font-display)' }}
          >
            {identity.name}
          </h2>
          <p className="text-base font-semibold text-[#00D4FF] mt-1.5" data-word>
            {identity.archetype}
          </p>

          {/* Description — one line by default, expandable */}
          <div data-word className="mt-4">
            <p className={`text-sm text-[#0A0A0A]/55 leading-relaxed ${descExpanded ? '' : 'line-clamp-1'}`}>
              {identity.description}
            </p>
            {identity.description.length > 60 && (
              <button
                onClick={() => setDescExpanded((o) => !o)}
                className="text-[11px] font-bold text-[#00D4FF] mt-1 active:opacity-60 transition-opacity"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {descExpanded ? 'Less' : 'Read more'}
              </button>
            )}
          </div>

          {/* Focus areas — icon chips */}
          <div className="mt-5 pt-5" style={{ borderTop: '1px solid rgba(10,10,10,0.07)' }}>
            <p className="text-[10px] font-bold tracking-widest uppercase text-[#0A0A0A]/30 mb-3"
              style={{ fontFamily: 'var(--font-display)' }}>
              Your focus areas
            </p>
            <div className="flex flex-wrap gap-2">
              {identity.focusAreas.map((a) => (
                <span key={a}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full text-xs font-semibold text-[#0A0A0A]/70"
                  style={{ background: 'rgba(10,10,10,0.045)', border: '1px solid rgba(10,10,10,0.07)' }}>
                  <span style={{ color: '#00D4FF' }}>
                    <QuizIcon name={focusAreaGlyph(a)} size={14} />
                  </span>
                  {a}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stack review — dark-background section */}
      <div
        className="mt-6 rounded-t-3xl overflow-hidden"
        style={{ background: 'var(--color-bg)' }}
      >
        <StackReviewPage />
      </div>

    </div>
  )
}
