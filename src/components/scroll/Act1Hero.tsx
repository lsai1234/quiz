'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { BottleScene } from '@/components/3d/BottleScene'

gsap.registerPlugin(ScrollTrigger)

const WORDS = ['Your', 'stack.', 'Built', 'for', 'you.']

// 8 capsules arc from bottle mouth to orbit positions around headline
// x/y are px offsets from starting position (bottle mouth area)
const CAPSULE_ARCS = [
  { toX: -155, toY:  10,  toRot: -45  },
  { toX: -85,  toY: -90,  toRot: -15  },
  { toX:  25,  toY: -110, toRot:  20  },
  { toX:  155, toY: -30,  toRot:  55  },
  { toX:  195, toY:  110, toRot:  85  },
  { toX:  115, toY:  230, toRot:  120 },
  { toX: -45,  toY:  245, toRot:  160 },
  { toX: -165, toY:  140, toRot: -100 },
]
const CAPSULE_COLORS = ['#00D4FF', '#80E8FF', '#00AACC', '#00D4FF', '#80E8FF', '#00D4FF', '#00AACC', '#80E8FF']

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
  const bottleWrapRef = useRef<HTMLDivElement>(null)
  const lidRef = useRef<HTMLDivElement>(null)
  const sweepRef = useRef<HTMLDivElement>(null)
  const capsuleRefs = useRef<(HTMLDivElement | null)[]>([])
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([])
  const subRef = useRef<HTMLParagraphElement>(null)
  const ctaRef = useRef<HTMLButtonElement>(null)
  const scrollHintRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (reducedMotion) {
      wordRefs.current.forEach(w => { if (w) gsap.set(w, { opacity: 1, y: 0 }) })
      if (subRef.current) gsap.set(subRef.current, { opacity: 1 })
      if (ctaRef.current) gsap.set(ctaRef.current, { opacity: 1, scale: 1 })
      return
    }

    const scroller = scrollerRef.current
    if (!scroller) return

    // Set initial states
    gsap.set(bottleWrapRef.current, { rotateY: 0, scale: 1, x: 0, y: 0 })
    gsap.set(lidRef.current, { x: 0, y: 0, rotation: 0, opacity: 1 })
    gsap.set(sweepRef.current, { x: '-120%', opacity: 0 })
    capsuleRefs.current.forEach(c => { if (c) gsap.set(c, { opacity: 0, scale: 0, x: 0, y: 0 }) })
    wordRefs.current.forEach(w => { if (w) gsap.set(w, { opacity: 0, y: 16 }) })
    if (subRef.current) gsap.set(subRef.current, { opacity: 0 })
    if (ctaRef.current) gsap.set(ctaRef.current, { opacity: 0, scale: 0.9 })

    // ONE timeline — all phases keyed to scroll progress via scrub: 1
    // Total 10s. Phases map to: 0-1.5 | 1.5-3.5 | 3.5-6.0 | 6.0-8.0 | 8.0-10.0
    const tl = gsap.timeline({ paused: true })

    // ── Phase 0 (0→15%): bottle tilts + scales ────────────────────────────
    tl.to(bottleWrapRef.current, {
      rotateY: 15, scale: 1.05,
      duration: 1.5, ease: 'power2.inOut',
    }, 0)

    // ── Phase 1 (15→35%): lid drifts up-left + light sweep ───────────────
    tl.to(lidRef.current, {
      x: -110, y: -150, rotation: -38, opacity: 0,
      duration: 2, ease: 'power2.out',
    }, 1.5)
    tl.fromTo(sweepRef.current,
      { x: '-120%', opacity: 0 },
      { x: '140%', opacity: 0.8, duration: 1.6, ease: 'power2.inOut' },
      1.5,
    )
    tl.to(sweepRef.current, { opacity: 0, duration: 0.4 }, 2.7)

    // ── Phase 2 (35→60%): capsules emerge staggered ───────────────────────
    CAPSULE_ARCS.forEach((arc, i) => {
      const el = capsuleRefs.current[i]
      if (!el) return
      tl.fromTo(el,
        { x: 0, y: 0, opacity: 0, scale: 0.2, rotation: 0 },
        { x: arc.toX, y: arc.toY, opacity: 1, scale: 1, rotation: arc.toRot,
          duration: 2.2, ease: 'power3.out' },
        3.5 + i * 0.1,
      )
    })

    // ── Phase 3 (60→80%): headline fades in word-by-word ─────────────────
    wordRefs.current.forEach((el, i) => {
      if (!el) return
      tl.to(el, { opacity: 1, y: 0, duration: 0.9, ease: 'power2.out' }, 6 + i * 0.18)
    })
    if (subRef.current) {
      tl.to(subRef.current, { opacity: 1, duration: 0.8, ease: 'power2.out' }, 7.0)
    }
    if (scrollHintRef.current) {
      tl.to(scrollHintRef.current, { opacity: 0, duration: 0.4 }, 6.0)
    }

    // ── Phase 4 (80→100%): bottle + capsules drift → CTA appears ─────────
    tl.to(bottleWrapRef.current, {
      x: 75, y: 55, scale: 0.68, opacity: 0.35,
      duration: 2, ease: 'power2.inOut',
    }, 8.0)
    capsuleRefs.current.forEach(el => {
      if (!el) return
      tl.to(el, {
        x: '+=35', y: '+=28', opacity: 0.25, scale: 0.82,
        duration: 1.8, ease: 'power2.inOut',
      }, 8.2)
    })
    if (ctaRef.current) {
      tl.to(ctaRef.current, { opacity: 1, scale: 1, duration: 0.8, ease: 'back.out(1.4)' }, 8.6)
    }

    const st = ScrollTrigger.create({
      trigger: scroller.firstElementChild as HTMLElement,
      scroller,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1,
      animation: tl,
    })

    return () => {
      st.kill()
      tl.kill()
    }
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

      {/* Parallax bg layer 1 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 80%, rgba(0,212,255,0.08), transparent)' }}
      />
      {/* Parallax bg layer 2 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 40% 30% at 78% 20%, rgba(0,212,255,0.04), transparent)' }}
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

      {/* 3D bottle — CSS perspective wrapper enables GSAP rotateY ─────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ perspective: '1000px' }}
      >
        <div
          ref={bottleWrapRef}
          className="w-full h-full"
          style={{ willChange: 'transform', transformStyle: 'preserve-3d' }}
        >
          <BottleScene />
        </div>
      </div>

      {/* HTML lid — positioned at bottle mouth (~26% from top) */}
      <div
        ref={lidRef}
        className="absolute pointer-events-none"
        style={{
          width: 52,
          height: 26,
          borderRadius: '26px 26px 8px 8px',
          background: 'linear-gradient(to bottom, #1ADBFF, #00AACC)',
          boxShadow: '0 0 18px rgba(0,212,255,0.65), inset 0 1px 0 rgba(255,255,255,0.3)',
          top: 'calc(26% - 13px)',
          left: 'calc(50% - 26px)',
          willChange: 'transform, opacity',
        }}
      />

      {/* Light sweep — diagonal gradient that crosses the bottle ─────────── */}
      <div
        ref={sweepRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(105deg, transparent 28%, rgba(255,255,255,0.11) 50%, transparent 72%)',
          willChange: 'transform, opacity',
        }}
      />

      {/* HTML capsules — emerge from bottle mouth ────────────────────────── */}
      {CAPSULE_ARCS.map((_, i) => (
        <div
          key={i}
          ref={(el) => { capsuleRefs.current[i] = el }}
          className="absolute pointer-events-none"
          style={{
            width: 10,
            height: 26,
            borderRadius: 5,
            background: CAPSULE_COLORS[i],
            boxShadow: `0 0 10px ${CAPSULE_COLORS[i]}90`,
            top: 'calc(26% - 13px)',
            left: 'calc(50% - 5px)',
            willChange: 'transform, opacity',
          }}
        />
      ))}

      {/* Hero text — fades in during phase 3 ────────────────────────────── */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6 z-10">
        <h1
          className="text-5xl sm:text-7xl font-black tracking-tight leading-[1.0] text-white text-center"
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
                willChange: 'transform, opacity',
              }}
            >
              {word}
            </span>
          ))}
        </h1>

        <p
          ref={subRef}
          className="mt-5 text-base text-white/50 max-w-xs mx-auto text-center"
          style={{ opacity: reducedMotion ? 1 : 0 }}
        >
          Answer 9 questions. Get a personalised supplement identity.
        </p>

        <button
          ref={ctaRef}
          onClick={onEnterQuiz}
          className="pointer-events-auto mt-12 px-8 py-4 rounded-full bg-[#00D4FF] text-[#0A0A0A] text-sm font-bold tracking-wide hover:brightness-110 active:scale-95 transition-[filter,transform]"
          style={{ fontFamily: 'var(--font-display)', opacity: reducedMotion ? 1 : 0 }}
        >
          Start your profile →
        </button>
      </div>

      {/* Scroll hint — fades out in phase 3 */}
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
