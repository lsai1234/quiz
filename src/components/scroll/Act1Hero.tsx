'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { BottleScene } from '@/components/3d/BottleScene'

gsap.registerPlugin(ScrollTrigger)

function CHRGDIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 1.15)} viewBox="0 0 100 115" fill="none">
      <rect x="36" y="1" width="28" height="13" rx="6" fill="white" />
      <rect x="6" y="12" width="88" height="101" rx="28" fill="none" stroke="white" strokeWidth="7" />
      <rect x="19" y="28" width="62" height="13" rx="4" fill="white" />
      <rect x="19" y="48" width="62" height="13" rx="4" fill="white" />
      <path d="M58 22L32 62H51L40 97L76 52H57L58 22Z" fill="#00D4FF" />
    </svg>
  )
}

interface Props {
  onEnterQuiz: () => void
  reducedMotion: boolean
}

// Four animated elements: bottleWrap, sweep, headline, cta
// scrub:1 timeline — ease:'none' so scrub is perfectly reversible

export function Act1Hero({ onEnterQuiz, reducedMotion }: Props) {
  const scrollerRef   = useRef<HTMLDivElement>(null)
  const bottleWrapRef = useRef<HTMLDivElement>(null)
  const sweepRef      = useRef<HTMLDivElement>(null)
  const headlineRef   = useRef<HTMLDivElement>(null)
  const ctaRef        = useRef<HTMLButtonElement>(null)
  const scrollHintRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (reducedMotion) {
        gsap.set([headlineRef.current, ctaRef.current], { opacity: 1, y: 0, scale: 1 })
        return
      }

      const scroller = scrollerRef.current
      if (!scroller) return

      // Initial states
      gsap.set(bottleWrapRef.current, { scale: 1, x: 0, opacity: 1 })
      gsap.set(sweepRef.current,      { x: '-120%', opacity: 0 })
      gsap.set(headlineRef.current,   { opacity: 0, y: 24 })
      gsap.set(ctaRef.current,        { opacity: 0, y: 12 })

      // ONE timeline, 3 phases, all ease:'none' so scrub is perfectly reversible
      const tl = gsap.timeline({ paused: true })

      // Phase 0→33%: bottle tilts, light sweep crosses
      tl.to(bottleWrapRef.current, {
        scale: 1.06, x: 20,
        duration: 3, ease: 'none',
      }, 0)
      tl.fromTo(sweepRef.current,
        { x: '-120%', opacity: 0 },
        { x: '140%', opacity: 0.7, duration: 2, ease: 'none' },
        0.5,
      )
      tl.to(sweepRef.current, { opacity: 0, duration: 0.5, ease: 'none' }, 2.0)

      // Phase 33→66%: headline fades in, bottle drifts aside
      tl.to(headlineRef.current, {
        opacity: 1, y: 0,
        duration: 3, ease: 'none',
      }, 3)
      tl.to(bottleWrapRef.current, {
        x: 70, scale: 0.75, opacity: 0.4,
        duration: 3, ease: 'none',
      }, 3)
      if (scrollHintRef.current) {
        tl.to(scrollHintRef.current, { opacity: 0, duration: 1, ease: 'none' }, 3)
      }

      // Phase 66→100%: CTA appears
      tl.to(ctaRef.current, {
        opacity: 1, y: 0,
        duration: 3, ease: 'none',
      }, 6)

      const st = ScrollTrigger.create({
        trigger: scroller.firstElementChild as HTMLElement,
        scroller,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 1,
        animation: tl,
      })

      return () => st.kill()
    })

    return () => ctx.revert()
  }, [reducedMotion])

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0A0A0A]">
      {/* Internal scroll driver — 300vh of scrollable space pinned to 100vh viewport */}
      <div
        ref={scrollerRef}
        className="absolute inset-0 overflow-y-scroll"
        style={{ scrollbarWidth: 'none' }}
      >
        <div style={{ height: '300vh' }} />
      </div>

      {/* Radial bg glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 80%, rgba(0,212,255,0.08), transparent)' }}
      />

      {/* Logo */}
      <div className="absolute top-6 left-0 right-0 flex justify-center pointer-events-none z-10">
        <div className="flex items-center gap-3">
          <CHRGDIcon size={28} />
          <span
            className="text-white font-black tracking-tight text-lg"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            getCHRGD
          </span>
        </div>
      </div>

      {/* 3D bottle */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ perspective: '1000px' }}
      >
        <div
          ref={bottleWrapRef}
          className="w-full h-full"
          style={{ transformStyle: 'preserve-3d' }}
        >
          <BottleScene />
        </div>
      </div>

      {/* Light sweep */}
      <div
        ref={sweepRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(105deg, transparent 28%, rgba(255,255,255,0.11) 50%, transparent 72%)',
        }}
      />

      {/* Hero text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6 z-10">
        <div
          ref={headlineRef}
          style={{ opacity: reducedMotion ? 1 : 0 }}
        >
          <h1
            className="text-5xl sm:text-7xl font-black tracking-tight leading-[1.0] text-white text-center"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Your stack.{' '}
            <span style={{ color: '#00D4FF' }}>Built for you.</span>
          </h1>
          <p className="mt-5 text-base text-white/50 max-w-xs mx-auto text-center">
            Answer 9 questions. Get a personalised supplement identity.
          </p>
        </div>

        <button
          ref={ctaRef}
          onClick={onEnterQuiz}
          className="pointer-events-auto mt-12 px-8 py-4 rounded-full bg-[#00D4FF] text-[#0A0A0A] text-sm font-bold tracking-wide hover:brightness-110 active:scale-95 transition-[filter,transform]"
          style={{ fontFamily: 'var(--font-display)', opacity: reducedMotion ? 1 : 0 }}
        >
          Start your profile →
        </button>
      </div>

      {/* Scroll hint */}
      <div
        ref={scrollHintRef}
        className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-2 pointer-events-none z-10"
      >
        <div className="w-px h-8 bg-white/20 animate-[scroll-hint_2s_ease-in-out_infinite]" />
        <p className="text-[10px] tracking-widest uppercase text-white/30">Scroll to reveal</p>
      </div>
    </div>
  )
}
