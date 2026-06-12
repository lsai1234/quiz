'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useQuizStore } from '@/lib/store'
import { StackReviewPage } from '@/components/stack-review/StackReviewPage'

gsap.registerPlugin(ScrollTrigger)

interface Props {
  onBuildBundle: () => void
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

export function Act4Reveal({ onBuildBundle, reducedMotion }: Props) {
  const { identity, answers } = useQuizStore()
  const firstName = answers.name?.split(' ')[0]?.trim() || null
  const headlineRef = useRef<HTMLDivElement>(null)

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
    <div className="bg-[#F5F5F0] min-h-screen pb-32">
      {/* Identity header */}
      <div className="px-5 pt-16 pb-10 max-w-lg mx-auto">
        <div ref={headlineRef}>
          <span
            className="text-[10px] font-bold tracking-[0.25em] uppercase text-[#00D4FF] mb-4 block"
            data-word style={{ fontFamily: 'var(--font-display)' }}
          >
            {firstName ? `${firstName}'s supplement identity` : 'Your supplement identity'}
          </span>
          <h2
            className="text-5xl font-black leading-tight tracking-tight text-[#0A0A0A]"
            data-word style={{ fontFamily: 'var(--font-display)' }}
          >
            {identity.name}
          </h2>
          <p className="text-base font-semibold text-[#00D4FF] mt-2" data-word>
            {identity.archetype}
          </p>
          <p className="text-sm text-[#0A0A0A]/50 mt-4 leading-relaxed" data-word>
            {identity.description}
          </p>
        </div>

        {/* Focus areas + score */}
        <div className="mt-8 flex items-start gap-6">
          <div className="flex-1">
            <p className="text-[10px] font-bold tracking-widest uppercase text-[#0A0A0A]/30 mb-3"
              style={{ fontFamily: 'var(--font-display)' }}>
              Focus areas
            </p>
            <div className="flex flex-wrap gap-2">
              {identity.focusAreas.map((a) => (
                <span key={a}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-[#0A0A0A]/6 text-[#0A0A0A]/60">
                  {a}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <ScoreRing score={identity.routineFitScore} />
            <p className="text-[9px] text-[#0A0A0A]/30 text-center max-w-[72px] leading-tight">
              Routine fit score
            </p>
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

      {/* Sticky Build my bundle CTA */}
      <div className="fixed bottom-0 left-0 right-0 px-5 pt-3 pb-8 bg-gradient-to-t from-[#F5F5F0] to-transparent">
        <div className="max-w-lg mx-auto">
          <button
            onClick={onBuildBundle}
            className="w-full py-4 rounded-2xl text-sm font-bold tracking-wide bg-[#0A0A0A] text-white active:scale-95 transition-all"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Build my bundle →
          </button>
        </div>
      </div>
    </div>
  )
}
