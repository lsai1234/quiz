'use client'

/**
 * Act1Hero — "The Deconstruction" scroll experience
 *
 * ── ASSET SPECS ──────────────────────────────────────────────────────────────
 * Drop real PNG cutouts into /public/hero/ with these exact filenames:
 *
 *   bottle.png      600 × 900 px   Transparent bg. Bottle body only (no lid).
 *                                  Portrait orientation, centred in canvas.
 *   lid.png         200 × 112 px   Transparent bg. Cap only. Bottom edge of
 *                                  cap = bottom edge of canvas (seats onto neck).
 *   capsule-1.png   200 × 80 px    Transparent bg. Horizontal pill shape
 *   …capsule-5.png                 (long axis = width). Brand colours.
 *
 * SVG placeholders with identical names live in /public/hero/ already.
 * Swap real PNGs in with the same filenames and dimensions.
 *
 * ── COORDINATE SYSTEM ────────────────────────────────────────────────────────
 * All animated <img> and caption <div> elements are rendered at
 * position:absolute left:0 top:0.  gsap.set() places them at their natural
 * starting coordinates using absolute pixel values from the section top-left.
 * GSAP x/y tweens are then direct pixel positions — no offset arithmetic.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

// ── Ingredient config ─────────────────────────────────────────────────────────
// Edit names / benefits here. `img` must match a file in /public/hero/.
const INGREDIENTS = [
  { name: 'Creatine Monohydrate', benefit: 'Strength + power output', img: '/hero/capsule-1.svg' },
  { name: 'Whey Isolate',         benefit: 'Fast muscle recovery',    img: '/hero/capsule-2.svg' },
  { name: 'Beta-Alanine',         benefit: 'Endurance + buffer',      img: '/hero/capsule-3.svg' },
  { name: 'Electrolyte Complex',  benefit: 'Hydration + performance', img: '/hero/capsule-4.svg' },
  { name: 'Ashwagandha KSM-66',   benefit: 'Stress + sleep quality',  img: '/hero/capsule-5.svg' },
]

// Rendered dimensions — match your real PNG canvas sizes (not content sizes)
const BOTTLE_W  = 240
const BOTTLE_H  = 360
const LID_W     = 80
const LID_H     = 45
const CAP_W     = 96   // capsule
const CAP_H     = 38

const BOTTLE_SRC = '/hero/bottle.svg'
const LID_SRC    = '/hero/lid.svg'

// ── Image preloader ───────────────────────────────────────────────────────────

function preloadImages(srcs: string[]): Promise<void> {
  return Promise.all(
    srcs.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image()
          img.onload  = () => resolve()
          img.onerror = () => resolve() // keep going — SVG placeholder still paints
          img.src = src
        }),
    ),
  ).then(() => undefined)
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Pos { x: number; y: number }

interface Props {
  onEnterQuiz: () => void
  reducedMotion: boolean
}

// ── Logo SVG ──────────────────────────────────────────────────────────────────

function CHRGDIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 1.15)} viewBox="0 0 100 115" fill="none">
      <rect x="36" y="1"  width="28" height="13"  rx="6"  fill="white" />
      <rect x="6"  y="12" width="88" height="101" rx="28" fill="none" stroke="white" strokeWidth="7" />
      <rect x="19" y="28" width="62" height="13"  rx="4"  fill="white" />
      <rect x="19" y="48" width="62" height="13"  rx="4"  fill="white" />
      <path d="M58 22L32 62H51L40 97L76 52H57L58 22Z" fill="#00D4FF" />
    </svg>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Act1Hero({ onEnterQuiz, reducedMotion }: Props) {
  const sectionRef   = useRef<HTMLElement>(null)
  const bottleRef    = useRef<HTMLImageElement>(null)
  const lidRef       = useRef<HTMLImageElement>(null)
  const sweepRef     = useRef<HTMLDivElement>(null)
  const ringRef      = useRef<HTMLDivElement>(null)
  const capsuleRefs  = useRef<(HTMLImageElement | null)[]>([])
  const captionRefs  = useRef<(HTMLDivElement | null)[]>([])
  const headline1Ref = useRef<HTMLDivElement>(null)
  const headline2Ref = useRef<HTMLDivElement>(null)
  const ctaRef       = useRef<HTMLButtonElement>(null)

  const [assetsReady, setAssetsReady]  = useState(false)
  const [resizeKey,   setResizeKey]    = useState(0)

  // Stable ref to avoid stale closure in CTA click handler
  const onEnterQuizRef = useRef(onEnterQuiz)
  useEffect(() => { onEnterQuizRef.current = onEnterQuiz }, [onEnterQuiz])

  // ── Shelf positions ───────────────────────────────────────────────────────
  // Returns absolute (x, y) from section top-left for each capsule.
  // x = left edge of the capsule img at its shelf position.
  // y = top  edge of the capsule img at its shelf position.
  const getLayout = useCallback(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const mobile = vw < 768

    // Bottle: centred horizontally, vertically centred
    const bottleX = (vw - BOTTLE_W) / 2
    const bottleY = (vh - BOTTLE_H) / 2

    // Lid: sits on top of the bottle neck.
    // Bottle SVG neck starts ~9% from top of the 450px viewBox → ~32px at 360px render.
    // Lid bottom aligns to that point: lidTop = bottleY + 32 - LID_H
    const lidX = (vw - LID_W) / 2
    const lidY = bottleY + 32 - LID_H   // ≈ bottleY - 13

    // Capsule starting position: at bottle mouth (neck centre ~18% down bottle)
    const capStartX = (vw - CAP_W) / 2
    const capStartY = bottleY + Math.round(BOTTLE_H * 0.18)  // ≈ 65px from bottle top

    // Ring pulse: same centre as the bottle mouth
    const ringSize = 80
    const ringX = (vw - ringSize) / 2
    const ringY = capStartY + (CAP_H - ringSize) / 2  // vertically centred on mouth

    // Shelf positions (where each capsule travels to)
    let shelf: Pos[]
    if (mobile) {
      const col0 = vw * 0.08
      const col1 = vw * 0.54
      const rowY = vh * 0.62
      const rowH = vh * 0.14
      shelf = INGREDIENTS.map((_, i) => ({
        x: i % 2 === 0 ? col0 : col1,
        y: rowY + Math.floor(i / 2) * rowH,
      }))
    } else {
      const shelfX = vw * 0.58
      const shelfY = vh * 0.18
      const rowH   = vh * 0.115
      shelf = INGREDIENTS.map((_, i) => ({ x: shelfX, y: shelfY + i * rowH }))
    }

    // Caption positions: right of capsule (desktop) or below (mobile)
    const captions: Pos[] = shelf.map((s) =>
      mobile
        ? { x: s.x, y: s.y + CAP_H + 4 }
        : { x: s.x + CAP_W + 10, y: s.y + CAP_H / 2 - 10 },
    )

    // How far the bottle slides left during Beat 3
    const bottleShiftX = mobile ? 0 : -(vw * 0.14)

    return { vw, vh, mobile, bottleX, bottleY, lidX, lidY, capStartX, capStartY, ringX, ringY, shelf, captions, bottleShiftX }
  }, [])

  // ── Preload assets ────────────────────────────────────────────────────────
  useEffect(() => {
    const srcs = [BOTTLE_SRC, LID_SRC, ...INGREDIENTS.map((i) => i.img)]
    preloadImages(srcs).then(() => setAssetsReady(true))
  }, [])

  // ── Debounced resize → rebuild ────────────────────────────────────────────
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const handler = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setResizeKey((k) => k + 1), 250)
    }
    window.addEventListener('resize', handler, { passive: true })
    return () => { clearTimeout(timer); window.removeEventListener('resize', handler) }
  }, [])

  // ── Main animation effect ─────────────────────────────────────────────────
  useEffect(() => {
    if (!assetsReady || reducedMotion) return
    const section = sectionRef.current
    if (!section) return

    const L = getLayout()
    const ctx = gsap.context(() => {

      // ── Set every element to its correct starting position ──────────────
      // All elements live at left:0 top:0 in CSS; GSAP x/y = pixels from section origin.

      gsap.set(bottleRef.current, {
        x: L.bottleX, y: L.bottleY - 20, scale: 1.1, opacity: 1,
      })
      gsap.set(lidRef.current, {
        x: L.lidX, y: L.lidY, rotation: 0, scale: 1, opacity: 1,
      })
      gsap.set(sweepRef.current, { x: '-110%', opacity: 0 })
      gsap.set(ringRef.current,  { x: L.ringX, y: L.ringY, scale: 0.3, opacity: 0 })
      gsap.set(headline1Ref.current, { opacity: 0, y: 24 })
      gsap.set(headline2Ref.current, { opacity: 0, y: 24 })
      gsap.set(ctaRef.current,       { opacity: 0, y: 16 })

      capsuleRefs.current.forEach((el) => {
        if (el) gsap.set(el, {
          x: L.capStartX, y: L.capStartY,
          opacity: 0, scale: 0.5, rotation: 12,
        })
      })

      captionRefs.current.forEach((el, i) => {
        if (el) gsap.set(el, {
          x: L.captions[i].x + 14,  // 14px nudge-in offset; tween removes it on arrival
          y: L.captions[i].y,
          opacity: 0,
        })
      })

      // ── ONE timeline, total = 10 time units → maps to 400vh via scrub ──
      const tl = gsap.timeline({ paused: true })

      // ── Beat 1 · ARRIVAL (t 0 → 1.2) ────────────────────────────────────
      // Bottle settles: scale 1.1→1.0, drifts down 20px
      tl.to(bottleRef.current, {
        scale: 1.0, y: L.bottleY,
        duration: 1.2, ease: 'none',
      }, 0)
      // Light sweep crosses diagonally once
      tl.fromTo(sweepRef.current,
        { x: '-110%', opacity: 0 },
        { x: '130%',  opacity: 0.5, duration: 0.8, ease: 'none' },
        0.2,
      )
      tl.to(sweepRef.current, { opacity: 0, duration: 0.25, ease: 'none' }, 0.85)

      // ── Beat 2 · THE OPENING (t 1.2 → 2.8) ──────────────────────────────
      // Lid lifts: -120px, -14° rotation, 60% opacity
      tl.to(lidRef.current, {
        x: L.lidX - L.vw * 0.025,
        y: L.lidY - 120,
        rotation: -14, scale: 1.04, opacity: 0.6,
        duration: 1.6, ease: 'none',
      }, 1.2)
      // Bottle counter-reaction: slight dip then recover
      tl.to(bottleRef.current, { scale: 0.98, duration: 0.5, ease: 'none' }, 1.35)
      tl.to(bottleRef.current, { scale: 1.0,  duration: 0.8, ease: 'none' }, 1.85)
      // Ring pulse from bottle mouth
      tl.to(ringRef.current, { scale: 2.6, opacity: 0.5, duration: 0.5, ease: 'none' }, 1.5)
      tl.to(ringRef.current, { opacity: 0,                duration: 0.6, ease: 'none' }, 1.8)

      // ── Beat 3 · THE INGREDIENTS (t 2.8 → 7.0) ──────────────────────────
      // Bottle slides left + shrinks to make room for ingredient lineup
      tl.to(bottleRef.current, {
        x: L.bottleX + L.bottleShiftX, scale: 0.85,
        duration: 1.3, ease: 'none',
      }, 2.8)
      // Lid follows bottle leftward (keep relative to bottle neck)
      tl.to(lidRef.current, {
        x: L.lidX + L.bottleShiftX - L.vw * 0.025,
        duration: 1.3, ease: 'none',
      }, 2.8)

      // Capsules rise one at a time, staggered across t 3.0 → 7.0
      const capsuleWindow = 4.0
      const perCap        = capsuleWindow / INGREDIENTS.length  // 0.8 each

      INGREDIENTS.forEach((_, i) => {
        const t0  = 3.0 + i * perCap         // capsule starts rising
        const t1  = t0 + perCap * 0.50       // arc peak
        const t2  = t0 + perCap * 0.75       // capsule lands at shelf
        const tCap = t0 + perCap * 0.85      // caption fades in

        const el  = capsuleRefs.current[i]
        const cap = captionRefs.current[i]
        if (!el) return

        // Arc midpoint: rise up and start bending outward
        const arcX = L.capStartX + (L.shelf[i].x - L.capStartX) * 0.3
                     + (i % 2 === 0 ? -18 : 18)
        const arcY = L.capStartY - L.vh * 0.13

        // Appear + rise to arc peak
        tl.to(el, {
          x: arcX, y: arcY,
          opacity: 1, scale: 0.82, rotation: 7,
          duration: perCap * 0.50, ease: 'none',
        }, t0)

        // Settle to shelf position
        tl.to(el, {
          x: L.shelf[i].x, y: L.shelf[i].y,
          scale: 1, rotation: 0,
          duration: perCap * 0.35, ease: 'none',
        }, t1)

        // Caption nudges into view beside its capsule
        if (cap) {
          tl.to(cap, {
            x: L.captions[i].x, opacity: 1,
            duration: perCap * 0.22, ease: 'none',
          }, tCap)
        }
      })

      // ── Beat 4 · REASSEMBLY (t 7.0 → 8.6) ───────────────────────────────
      const rStart = 7.0

      // Captions fade out fast
      captionRefs.current.forEach((el) => {
        if (el) tl.to(el, { opacity: 0, x: `+=8`, duration: 0.3, ease: 'none' }, rStart)
      })

      // Capsules fly back in reverse order with tight stagger
      const returnPer = 0.20
      ;[...INGREDIENTS].reverse().forEach((_, ri) => {
        const i  = INGREDIENTS.length - 1 - ri
        const el = capsuleRefs.current[i]
        if (!el) return
        tl.to(el, {
          x: L.capStartX, y: L.capStartY,
          opacity: 0, scale: 0.5, rotation: 12,
          duration: returnPer + 0.12, ease: 'none',
        }, rStart + 0.28 + ri * returnPer)
      })

      // Bottle returns to centre
      const bReturn = rStart + 0.15
      tl.to(bottleRef.current, {
        x: L.bottleX, scale: 1.0,
        duration: 1.05, ease: 'none',
      }, bReturn)

      // Lid: follow bottle back, overshoot 4px then settle
      tl.to(lidRef.current, {
        x: L.lidX, y: L.lidY - 4,
        rotation: 0, scale: 1.0, opacity: 1,
        duration: 0.95, ease: 'none',
      }, bReturn)
      tl.to(lidRef.current, {
        y: L.lidY,
        duration: 0.32, ease: 'none',
      }, bReturn + 0.95)

      // ── Beat 5 · HANDOFF (t 8.6 → 10.0) ─────────────────────────────────
      const hStart = 8.6
      tl.to(bottleRef.current, { opacity: 0.8, duration: 0.45, ease: 'none' }, hStart)
      tl.to(headline1Ref.current, { opacity: 1, y: 0, duration: 0.65, ease: 'none' }, hStart + 0.15)
      tl.to(headline2Ref.current, { opacity: 1, y: 0, duration: 0.65, ease: 'none' }, hStart + 0.65)
      tl.to(ctaRef.current,       { opacity: 1, y: 0, duration: 0.55, ease: 'none' }, hStart + 1.1)

      // ── ScrollTrigger — pin + scrub ───────────────────────────────────────
      ScrollTrigger.create({
        trigger: section,
        start:   'top top',
        end:     `+=${L.mobile ? '300%' : '400%'}`,
        pin:     true,
        scrub:   1,
        animation: tl,
        anticipatePin: 1,
      })

    }, section)  // scope gsap.context to the section element

    return () => ctx.revert()  // kills timeline + ScrollTrigger on cleanup
  }, [assetsReady, reducedMotion, getLayout, resizeKey])

  // ── Reduced-motion: static composed layout ────────────────────────────────
  if (reducedMotion) {
    return (
      <section className="relative w-full min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-6 py-20">
        <div className="absolute top-6 left-0 right-0 flex justify-center z-10">
          <div className="flex items-center gap-3">
            <CHRGDIcon />
            <span className="text-white font-black text-lg tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              getCHRGD
            </span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-12 max-w-4xl mx-auto pt-16">
          <div className="relative shrink-0">
            <img src={LID_SRC}    alt="" width={LID_W}    height={LID_H}    className="absolute left-1/2 -translate-x-1/2 -top-8 object-contain" />
            <img src={BOTTLE_SRC} alt="" width={BOTTLE_W} height={BOTTLE_H} className="object-contain" style={{ maxHeight: 240 }} />
          </div>
          <div className="flex flex-col gap-4">
            {INGREDIENTS.map((ing, i) => (
              <div key={i} className="flex items-center gap-3">
                <img src={ing.img} alt="" width={CAP_W * 0.75} height={CAP_H * 0.75} className="object-contain shrink-0" />
                <div>
                  <p className="text-white text-sm font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{ing.name}</p>
                  <p className="text-white/40 text-xs mt-0.5">{ing.benefit}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center mt-12 max-w-xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-black text-white leading-tight tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Every body is different.
          </h1>
          <p className="text-4xl md:text-5xl font-black leading-tight tracking-tight mt-1" style={{ fontFamily: 'var(--font-display)', color: '#00D4FF' }}>
            Find your stack.
          </p>
          <button
            onClick={onEnterQuiz}
            className="mt-10 px-8 py-4 rounded-full bg-[#00D4FF] text-[#0A0A0A] text-sm font-bold tracking-wide active:scale-95 transition-transform"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Start your profile →
          </button>
        </div>
      </section>
    )
  }

  // ── Animated layout ───────────────────────────────────────────────────────
  // All animated elements use position:absolute left:0 top:0.
  // gsap.set() inside useEffect places them at their real starting coordinates.
  // CSS positioning here is just the render fallback before the effect runs.
  return (
    <section
      ref={sectionRef}
      className="relative w-full h-screen bg-[#0A0A0A] overflow-hidden"
    >
      {/* Background radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 55% at 50% 62%, rgba(0,212,255,0.07), transparent)' }}
      />

      {/* Logo */}
      <div className="absolute top-6 left-0 right-0 flex justify-center z-30 pointer-events-none">
        <div className="flex items-center gap-3">
          <CHRGDIcon />
          <span className="text-white font-black text-lg tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            getCHRGD
          </span>
        </div>
      </div>

      {/* Loading state */}
      {!assetsReady && (
        <div className="absolute inset-0 flex items-center justify-center z-40">
          <div className="w-9 h-9 rounded-full border-2 border-white/10 border-t-[#00D4FF] animate-spin" />
        </div>
      )}

      {/* Light sweep — full-viewport diagonal gradient, translates across */}
      <div
        ref={sweepRef}
        className="absolute inset-0 pointer-events-none z-10"
        style={{ background: 'linear-gradient(108deg, transparent 30%, rgba(255,255,255,0.09) 50%, transparent 70%)' }}
      />

      {/* Ring pulse at bottle mouth */}
      <div
        ref={ringRef}
        className="absolute pointer-events-none z-10"
        style={{
          width: 80, height: 80,
          left: 0, top: 0,
          borderRadius: '50%',
          border: '1.5px solid rgba(0,212,255,0.7)',
          willChange: 'transform, opacity',
        }}
      />

      {/* Bottle body */}
      <img
        ref={bottleRef}
        src={BOTTLE_SRC}
        alt="CHRGD supplement bottle"
        width={BOTTLE_W}
        height={BOTTLE_H}
        draggable={false}
        className="absolute object-contain pointer-events-none z-10"
        style={{
          left: 0, top: 0,
          willChange: 'transform, opacity',
          opacity: assetsReady ? 1 : 0,
        }}
      />

      {/* Lid */}
      <img
        ref={lidRef}
        src={LID_SRC}
        alt=""
        width={LID_W}
        height={LID_H}
        draggable={false}
        className="absolute object-contain pointer-events-none z-20"
        style={{
          left: 0, top: 0,
          willChange: 'transform, opacity',
          opacity: assetsReady ? 1 : 0,
        }}
      />

      {/* Capsules — all start at left:0 top:0; gsap.set() positions them */}
      {INGREDIENTS.map((ing, i) => (
        <img
          key={i}
          ref={(el) => { capsuleRefs.current[i] = el }}
          src={ing.img}
          alt={ing.name}
          width={CAP_W}
          height={CAP_H}
          draggable={false}
          className="absolute object-contain pointer-events-none z-20"
          style={{ left: 0, top: 0, willChange: 'transform, opacity', opacity: 0 }}
        />
      ))}

      {/* Captions — one per capsule; gsap.set() positions each independently */}
      {INGREDIENTS.map((ing, i) => (
        <div
          key={i}
          ref={(el) => { captionRefs.current[i] = el }}
          className="absolute pointer-events-none z-20"
          style={{ left: 0, top: 0, willChange: 'transform, opacity', opacity: 0 }}
        >
          <p
            className="text-white text-[11px] font-semibold leading-none whitespace-nowrap"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {ing.name}
          </p>
          <p className="text-white/40 text-[10px] mt-1 whitespace-nowrap leading-none">
            {ing.benefit}
          </p>
        </div>
      ))}

      {/* Headlines + CTA — centred flex, opacity-only animation from GSAP */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-30 px-6 text-center">
        <div ref={headline1Ref} style={{ willChange: 'transform, opacity' }}>
          <h1
            className="text-4xl sm:text-[3.5rem] font-black text-white leading-tight tracking-tight"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Every body is different.
          </h1>
        </div>
        <div ref={headline2Ref} className="mt-1" style={{ willChange: 'transform, opacity' }}>
          <p
            className="text-4xl sm:text-[3.5rem] font-black leading-tight tracking-tight"
            style={{ fontFamily: 'var(--font-display)', color: '#00D4FF' }}
          >
            Find your stack.
          </p>
        </div>
        <button
          ref={ctaRef}
          onClick={() => onEnterQuizRef.current()}
          className="pointer-events-auto mt-10 px-8 py-4 rounded-full bg-[#00D4FF] text-[#0A0A0A] text-sm font-bold tracking-wide active:scale-95 transition-transform"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Start your profile →
        </button>
      </div>

      {/* Scroll hint */}
      <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-2 pointer-events-none z-20">
        <div className="w-px h-8 bg-white/20 animate-[scroll-hint_2s_ease-in-out_infinite]" />
        <p className="text-[10px] tracking-widest uppercase text-white/30">Scroll to reveal</p>
      </div>
    </section>
  )
}
