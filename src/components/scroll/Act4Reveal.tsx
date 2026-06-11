'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useQuizStore } from '@/lib/store'
import { buildRecommendedStack } from '@/lib/recommendation'

gsap.registerPlugin(ScrollTrigger)

interface Props {
  onBuildBundle: () => void
  reducedMotion: boolean
}

function ScoreRing({ score }: { score: number }) {
  const [animated, setAnimated] = useState(false)
  const numRef = useRef<HTMLSpanElement>(null)
  const r = 36
  const circ = 2 * Math.PI * r
  const dash = animated ? (score / 10) * circ : 0

  useEffect(() => {
    const t = setTimeout(() => {
      setAnimated(true)
      // Count up from 0
      const counter = { val: 0 }
      gsap.to(counter, {
        val: score,
        duration: 1.4,
        ease: 'power2.out',
        delay: 0.1,
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
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ - dash}
          style={{
            transition: 'stroke-dashoffset 1.3s cubic-bezier(0.34,1.56,0.64,1)',
            filter: 'drop-shadow(0 0 4px rgba(0,212,255,0.5))',
          }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span ref={numRef} className="text-xl font-black text-[#0A0A0A]" style={{ fontFamily: 'var(--font-display)' }}>
          0
        </span>
        <span className="text-[9px] text-[#0A0A0A]/40">/10</span>
      </div>
    </div>
  )
}

export function Act4Reveal({ onBuildBundle, reducedMotion }: Props) {
  const { identity, answers, selectedProducts } = useQuizStore()
  const firstName = answers.name?.split(' ')[0]?.trim() || null
  const cardsRef = useRef<HTMLDivElement>(null)
  const headlineRef = useRef<HTMLDivElement>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const recommended = buildRecommendedStack(answers)

  // Stagger cards in on scroll-enter
  useEffect(() => {
    if (!cardsRef.current || reducedMotion) return
    const cards = cardsRef.current.querySelectorAll('[data-card]')
    const st = ScrollTrigger.create({
      trigger: cardsRef.current,
      start: 'top 80%',
      onEnter: () => {
        gsap.fromTo(cards, { y: 60, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.12, duration: 0.6, ease: 'power2.out', delay: 0 })
      },
    })
    return () => st.kill()
  }, [reducedMotion])

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

      {/* Divider */}
      <div className="h-px bg-[#0A0A0A]/8 mx-5" />

      {/* Product cards */}
      <div className="px-5 pt-8 max-w-lg mx-auto">
        <p className="text-[10px] font-bold tracking-widest uppercase text-[#0A0A0A]/30 mb-5"
          style={{ fontFamily: 'var(--font-display)' }}>
          Your recommended stack — {selectedProducts.length} products
        </p>

        <div ref={cardsRef} className="flex flex-col gap-3">
          {selectedProducts.map((product) => (
            <div
              key={product.id}
              data-card
              className="bg-white rounded-2xl border border-[#0A0A0A]/6 overflow-hidden"
              style={{ opacity: reducedMotion ? 1 : 0 }}
            >
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* Colour accent dot */}
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background: product.accentColor }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-[#0A0A0A]"
                        style={{ fontFamily: 'var(--font-display)' }}>
                        {product.name}
                      </p>
                      <p className="text-sm font-bold text-[#0A0A0A] flex-shrink-0">
                        £{product.price}/mo
                      </p>
                    </div>
                    <p className="text-xs text-[#0A0A0A]/40 mt-0.5">{product.subcategory}</p>
                    <p className="text-xs text-[#0A0A0A]/55 mt-2 leading-relaxed">
                      {product.safeWording}
                    </p>
                  </div>
                </div>

                {/* Expandable reason */}
                <button
                  onClick={() => setExpandedId(expandedId === product.id ? null : product.id)}
                  className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-[#0A0A0A]/35 active:opacity-60"
                >
                  <span>{expandedId === product.id ? '↑' : '↓'}</span>
                  Why this was chosen
                </button>

                {expandedId === product.id && (
                  <div
                    className="mt-3 p-3 rounded-xl bg-[#00D4FF]/10 text-xs text-[#0A0A0A]/60 leading-relaxed"
                    style={{ animation: 'slide-up-in 0.25s ease both' }}
                  >
                    Selected based on your{' '}
                    {product.goalTags.slice(0, 2).join(' and ')} goals
                    {product.beginner ? ', with beginner-friendly dosing' : ''}.
                    {product.vegan ? ' Vegan-certified.' : ''}
                    {product.stimulant ? ' Contains caffeine.' : ''}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Excluded reasons */}
          {recommended.excluded.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-bold tracking-widest uppercase text-[#0A0A0A]/25 mb-3"
                style={{ fontFamily: 'var(--font-display)' }}>
                Not included
              </p>
              {recommended.excluded.map(({ category, reason }) => (
                <div key={category} className="flex gap-3 py-2.5">
                  <div className="w-1 h-1 rounded-full bg-[#0A0A0A]/20 mt-1.5 flex-shrink-0" />
                  <div>
                    <span className="text-xs font-semibold text-[#0A0A0A]/40 capitalize">{category}</span>
                    <span className="text-xs text-[#0A0A0A]/30"> — {reason}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
