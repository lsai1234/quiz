'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { BottleScene } from '@/components/3d/BottleScene'

gsap.registerPlugin(ScrollTrigger)

const WORDS = ['Your', 'stack.', 'Built', 'for', 'you.']

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

export function Act1Hero({ onEnterQuiz, reducedMotion }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([])
  const ctaRef = useRef<HTMLButtonElement>(null)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [ctaVisible, setCtaVisible] = useState(reducedMotion)

  useEffect(() => {
    if (reducedMotion) {
      setScrollProgress(0.5)
      setCtaVisible(true)
      return
    }

    const scroller = scrollerRef.current
    if (!scroller) return

    wordRefs.current.forEach((w) => {
      if (w) { w.style.opacity = '0'; w.style.transform = 'translateY(20px)' }
    })

    const st = ScrollTrigger.create({
      trigger: scroller.firstElementChild as HTMLElement,
      scroller,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1,
      onUpdate: (self) => {
        setScrollProgress(self.progress)

        const wordProgress = Math.max((self.progress - 0.3) / 0.4, 0)
        wordRefs.current.forEach((w, i) => {
          if (!w) return
          const wp = Math.max((wordProgress - i * 0.08) / 0.15, 0)
          const clamped = Math.min(wp, 1)
          w.style.opacity = String(clamped)
          w.style.transform = `translateY(${(1 - clamped) * 20}px)`
        })

        if (self.progress > 0.65 && !ctaVisible) setCtaVisible(true)
      },
    })

    return () => { st.kill() }
  }, [reducedMotion]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ctaVisible || !ctaRef.current || reducedMotion) return
    gsap.fromTo(
      ctaRef.current,
      { scale: 0.9, opacity: 0 },
      {
        scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.4)',
        onComplete: () => {
          gsap.to(ctaRef.current, { scale: 1.04, duration: 0.6, yoyo: true, repeat: 1, ease: 'power1.inOut' })
        },
      },
    )
  }, [ctaVisible, reducedMotion])

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0A0A0A]">
      {/* Scroll driver — 300vh content pins to 100vh viewport */}
      <div
        ref={scrollerRef}
        className="absolute inset-0 overflow-y-scroll"
        style={{ scrollbarWidth: 'none' }}
      >
        <div style={{ height: '300vh' }} />
      </div>

      {/* 3D bottle scene */}
      <div className="absolute inset-0 pointer-events-none">
        <BottleScene scrollProgress={scrollProgress} />
      </div>

      {/* Cyan radial glow from below */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 80%, rgba(0,212,255,0.1), transparent)',
        }}
      />

      {/* getCHRGD logo — top center */}
      <div className="absolute top-6 left-0 right-0 flex justify-center pointer-events-none">
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

      {/* Hero text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6">
        <div className="text-center space-y-0">
          <h1
            className="text-5xl sm:text-7xl font-black tracking-tight leading-[1.0] text-white"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {WORDS.map((word, i) => (
              <span
                key={i}
                ref={(el) => { wordRefs.current[i] = el }}
                className="inline-block mr-[0.25em]"
                style={{
                  color: word === 'you.' ? '#00D4FF' : 'white',
                  opacity: reducedMotion ? 1 : 0,
                }}
              >
                {word}
              </span>
            ))}
          </h1>
          <p
            className="mt-5 text-base text-white/50 max-w-xs mx-auto"
            style={{ opacity: reducedMotion ? 1 : 0 }}
            ref={(el) => { wordRefs.current[5] = el }}
          >
            Answer 9 questions. Get a personalised supplement identity.
          </p>
        </div>

        {ctaVisible && (
          <button
            ref={ctaRef}
            onClick={onEnterQuiz}
            className="pointer-events-auto mt-12 px-8 py-4 rounded-full bg-[#00D4FF] text-[#0A0A0A] text-sm font-bold tracking-wide transition-all active:scale-95 hover:brightness-110"
            style={{ fontFamily: 'var(--font-display)', opacity: 0 }}
          >
            Start your profile →
          </button>
        )}
      </div>

      {!ctaVisible && (
        <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-2 pointer-events-none">
          <div className="w-px h-8 bg-white/20 animate-[scroll-hint_2s_ease-in-out_infinite]" />
          <p className="text-[10px] tracking-widest uppercase text-white/30">Scroll to reveal</p>
        </div>
      )}
    </div>
  )
}
