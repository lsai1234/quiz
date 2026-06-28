'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useQuizStore } from '@/lib/store'

interface Props {
  onComplete: () => void
  reducedMotion: boolean
}

const ACCENT = '#00D4FF'

function CHRGDIcon({ size = 34 }: { size?: number }) {
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

function Bolt() {
  return (
    <svg width="30" height="40" viewBox="0 0 100 115" fill="none">
      <path d="M58 22L32 62H51L40 97L76 52H57L58 22Z" fill="white" />
    </svg>
  )
}

const DATA_POINTS = [
  { x: 16, y: 24, s: 2, d: 0 }, { x: 88, y: 30, s: 2, d: 0.6 }, { x: 84, y: 76, s: 2, d: 1.0 },
  { x: 20, y: 80, s: 2, d: 0.3 }, { x: 50, y: 10, s: 2, d: 0.8 },
]

const CORE_R = 52
const CORE_CIRC = 2 * Math.PI * CORE_R

export function Act3Analysis({ onComplete, reducedMotion }: Props) {
  const vizRef = useRef<HTMLDivElement>(null)
  const batteryRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const pctRef = useRef<HTMLSpanElement>(null)
  const coreRef = useRef<HTMLDivElement>(null)
  const coreRingRef = useRef<SVGCircleElement>(null)
  const flareRef = useRef<HTMLDivElement>(null)
  const sparkRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const capRef = useRef<HTMLDivElement>(null)
  const boltRef = useRef<HTMLDivElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLParagraphElement>(null)
  const [docked, setDocked] = useState(reducedMotion)

  useLayoutEffect(() => {
    const minDisplay = reducedMotion ? 900 : 4200
    const dockAt = reducedMotion ? 0 : 1.15 // seconds until the battery is seated
    let animDone = false
    let ready = useQuizStore.getState().stackReady
    let finished = false

    // p = charge transferred into the machine (0→1). Battery charge = 1 − p.
    // One source drives the battery fill, the % counter and the core ring.
    const proxy = { p: 0 }
    const render = () => {
      const charge = 1 - proxy.p
      if (fillRef.current) fillRef.current.style.height = `${Math.max(0, charge * 100)}%`
      if (pctRef.current) pctRef.current.textContent = `${Math.round(charge * 100)}%`
      if (coreRingRef.current) coreRingRef.current.style.strokeDashoffset = String(CORE_CIRC * (1 - proxy.p))
    }
    render()

    // The battery is a fixed element sat exactly over its in-flow slot, so the
    // SAME element can morph from the rail's shape to the battery's without
    // reflowing the machine beneath it (and with no second element to "flip").
    const slot = slotRef.current?.getBoundingClientRect()
    const seat = () => {
      if (slot) gsap.set(batteryRef.current, { position: 'fixed', margin: 0, zIndex: 30, left: slot.left, top: slot.top, width: slot.width, height: slot.height })
    }

    const finish = () => {
      if (finished || !animDone || !ready) return
      finished = true
      if (reducedMotion) { onComplete(); return }
      if (textRef.current) textRef.current.textContent = 'Powering on'
      gsap.to(proxy, { p: 1, duration: 0.5, ease: 'power2.in', onUpdate: render })
      if (flareRef.current) flareRef.current.style.animation = 'core-flare 0.65s ease-out forwards'
      gsap.to(coreRef.current, { scale: 1.12, duration: 0.28, ease: 'power2.out', delay: 0.18, yoyo: true, repeat: 1 })
      gsap.to(batteryRef.current, { opacity: 0.25, duration: 0.4, ease: 'power2.in', delay: 0.2 })
      gsap.to(vizRef.current, { opacity: 0, scale: 1.06, duration: 0.5, ease: 'power2.in', delay: 0.6, onComplete })
      gsap.to(textRef.current, { opacity: 0, duration: 0.35, ease: 'power2.in', delay: 0.6 })
    }

    const unsub = useQuizStore.subscribe((s) => { if (s.stackReady && !ready) { ready = true; finish() } })
    const minTimer = setTimeout(() => {
      animDone = true
      if (!ready) ready = useQuizStore.getState().stackReady
      finish()
    }, minDisplay)

    let tl: gsap.core.Timeline | null = null

    if (reducedMotion) {
      seat()
      gsap.set(batteryRef.current, { opacity: 1 })
    } else if (slot) {
      tl = gsap.timeline()
      tl.fromTo(vizRef.current, { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0)
      // Core sits dim until the battery docks.
      gsap.set(coreRef.current, { opacity: 0.32 })

      // Start the battery AS the charge rail: slim, pinned to the screen edge,
      // the glass details hidden so only the cyan fill reads (exactly the rail).
      const vw = window.innerWidth
      const vh = window.innerHeight
      const H = Math.min(vh * 0.56, 420) // matches ChargeRail's inner height
      gsap.set(batteryRef.current, { position: 'fixed', margin: 0, zIndex: 30, opacity: 1, left: vw - 24, top: (vh - H) / 2 + 10, width: 6, height: H - 46 })
      gsap.set(shellRef.current, { borderRadius: 999 })
      gsap.set([capRef.current, highlightRef.current, pctRef.current, boltRef.current], { opacity: 0 })
      if (fillRef.current) fillRef.current.style.height = '92%'

      // One continuous motion: the SAME element reshapes (size + corner radius)
      // and glides to the dock on a single eased curve — no shape "flip".
      const ease = 'power2.inOut'
      tl.to(batteryRef.current, { left: slot.left, top: slot.top, width: slot.width, height: slot.height, duration: 1.15, ease }, 0)
      tl.to(shellRef.current, { borderRadius: 18, duration: 1.15, ease }, 0)

      // Top the charge off to full as it becomes the battery.
      const fillProxy = { h: 92 }
      tl.to(fillProxy, { h: 100, duration: 0.95, ease: 'power1.out', onUpdate: () => { if (fillRef.current) fillRef.current.style.height = `${fillProxy.h}%` } }, 0.1)

      // The battery's glass details emerge as the shape resolves — no sudden pop.
      tl.to(capRef.current, { opacity: 1, duration: 0.55, ease: 'power2.out' }, 0.62)
      tl.to(highlightRef.current, { opacity: 1, duration: 0.55, ease: 'power2.out' }, 0.62)
      tl.to(boltRef.current, { opacity: 0.3, duration: 0.55, ease: 'power2.out' }, 0.66)
      tl.to(pctRef.current, { opacity: 1, duration: 0.4, ease: 'power2.out' }, 0.85)

      // Dock — connectors spark, core wakes.
      tl.add(() => {
        setDocked(true)
        if (sparkRef.current) sparkRef.current.style.animation = 'charge-burst 0.5s ease-out forwards'
      }, dockAt)
      tl.to(coreRef.current, { opacity: 1, duration: 0.4, ease: 'power2.out' }, dockAt)
      tl.fromTo(coreRef.current, { scale: 0.94 }, { scale: 1, duration: 0.45, ease: 'back.out(1.6)' }, dockAt)

      // Discharge — drain most of the battery into the core.
      tl.to(proxy, { p: 0.92, duration: minDisplay / 1000 - dockAt - 0.5, ease: 'power1.inOut', onUpdate: render }, dockAt + 0.1)

      const messages = ['Plugging in your charge…', 'Powering CHRGD Intelligence…', 'Reading your profile…', 'Building your stack…']
      messages.forEach((msg, i) => {
        tl!.call(() => {
          if (textRef.current) {
            gsap.fromTo(textRef.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35 })
            textRef.current.textContent = msg
          }
        }, [], dockAt + 0.1 + i * ((minDisplay / 1000 - dockAt - 0.5) / 4))
      })
    } else {
      // Fallback (no slot measured): just show the battery in place.
      seat()
      gsap.set(batteryRef.current, { opacity: 1 })
    }

    return () => { unsub(); clearTimeout(minTimer); tl?.kill() }
  }, [onComplete, reducedMotion])

  return (
    <div className="w-full min-h-[100dvh] bg-[#0A0A0A] flex flex-col items-center justify-center px-6 overflow-hidden">

      {/* Battery — a single element that starts as the quiz charge rail and morphs
          into this glass cell (fixed, sat over its in-flow slot below). */}
      <div ref={batteryRef} style={{ position: 'fixed', zIndex: 30, width: 68, height: 120, opacity: reducedMotion ? 1 : 0 }}>
        {/* terminal cap */}
        <div ref={capRef} className="absolute left-1/2 -translate-x-1/2 -top-[6px] rounded-[3px]" style={{ width: 26, height: 6, background: 'linear-gradient(180deg, rgba(255,255,255,0.4), rgba(255,255,255,0.15))' }} />
        {/* shell */}
        <div
          ref={shellRef}
          className="absolute inset-0 overflow-hidden"
          style={{
            borderRadius: 18,
            background: 'linear-gradient(155deg, rgba(255,255,255,0.07), rgba(255,255,255,0.015))',
            boxShadow: reducedMotion
              ? 'inset 0 0 0 1px rgba(255,255,255,0.16), inset 0 2px 10px rgba(255,255,255,0.06)'
              : 'inset 0 0 0 1px rgba(255,255,255,0.16), inset 0 2px 10px rgba(255,255,255,0.06), 0 0 26px -6px rgba(0,212,255,0.5)',
            animation: reducedMotion ? undefined : 'battery-hum 2.8s ease-in-out infinite',
          }}
        >
          {/* charge fill */}
          <div ref={fillRef} className="absolute inset-x-0 bottom-0" style={{ height: '100%', background: 'linear-gradient(180deg, rgba(0,212,255,0.95), rgba(0,170,204,0.55))' }}>
            <div className="absolute inset-x-0 top-0" style={{ height: 8, background: 'linear-gradient(180deg, rgba(255,255,255,0.65), transparent)' }} />
          </div>
          {/* bolt watermark */}
          <div ref={boltRef} className="absolute inset-0 flex items-center justify-center opacity-30 mix-blend-overlay"><Bolt /></div>
          {/* glass highlight */}
          <div ref={highlightRef} className="absolute inset-y-2 left-2 w-2 rounded-full pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.35), transparent 60%)' }} />
        </div>
        <span ref={pctRef} className="absolute -right-11 top-1/2 -translate-y-1/2 text-sm font-semibold tabular-nums" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>100%</span>
        {/* contact spark at the terminal */}
        <div ref={sparkRef} className="absolute left-1/2 -translate-x-1/2 -bottom-2 rounded-full pointer-events-none" style={{ width: 22, height: 22, opacity: 0, background: 'radial-gradient(circle, rgba(255,255,255,0.95), rgba(0,212,255,0.6) 50%, transparent 70%)' }} />
      </div>

      <div ref={vizRef} className="relative flex flex-col items-center" style={{ opacity: reducedMotion ? 1 : 0, width: 320 }}>

        {/* Battery slot — reserves the docked battery's space in the column */}
        <div ref={slotRef} aria-hidden style={{ width: 68, height: 120 }} />

        {/* Conduit gap — electric bolts leap from the battery into the core when docked */}
        <div className="relative my-1.5" style={{ width: 60, height: 52 }}>
          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0" style={{ width: 1, background: 'linear-gradient(180deg, rgba(0,212,255,0.28), rgba(0,212,255,0.06))' }} />
          {docked && !reducedMotion && [0, 0.34, 0.68].map((d, i) => (
            <div
              key={i}
              className="absolute left-1/2 top-0"
              style={{ '--arc': '76px', animation: `arc-fly 1s linear ${d}s infinite`, filter: 'drop-shadow(0 0 5px rgba(0,212,255,0.9))' } as React.CSSProperties}
            >
              <svg width="9" height="13" viewBox="0 0 100 115" fill="none">
                <path d="M58 22L32 62H51L40 97L76 52H57L58 22Z" fill="#fff" />
              </svg>
            </div>
          ))}
        </div>

        {/* Machine core */}
        <div ref={coreRef} className="relative" style={{ width: 190, height: 190 }}>
          <div ref={flareRef} className="absolute top-1/2 left-1/2 rounded-full pointer-events-none" style={{ width: 190, height: 190, opacity: 0, background: 'radial-gradient(circle, rgba(0,212,255,0.55), transparent 60%)' }} />
          {[0.5, 0.72, 0.94].map((r, i) => (
            <div key={i} className="absolute rounded-full border border-[#00D4FF]/20 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ width: `${r * 190}px`, height: `${r * 190}px`, animation: reducedMotion ? undefined : `ring-pulse ${2.4 + i * 0.6}s ease-out ${i * 0.5}s infinite` }} />
          ))}
          <svg viewBox="0 0 190 190" className="absolute inset-0 -rotate-90 w-full h-full">
            <circle cx="95" cy="95" r={CORE_R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
            <circle ref={coreRingRef} cx="95" cy="95" r={CORE_R} fill="none" stroke={ACCENT} strokeWidth="3" strokeLinecap="round"
              strokeDasharray={CORE_CIRC} strokeDashoffset={CORE_CIRC} style={{ filter: 'drop-shadow(0 0 5px rgba(0,212,255,0.8))' }} />
          </svg>
          <div className="absolute inset-0" style={{ animation: reducedMotion ? undefined : 'spin-slow 6s linear infinite' }}>
            <svg viewBox="0 0 190 190" fill="none" className="w-full h-full">
              <circle cx="95" cy="95" r="84" stroke={ACCENT} strokeWidth="1.2" strokeLinecap="round" strokeDasharray="44 500" style={{ filter: 'drop-shadow(0 0 5px rgba(0,212,255,0.8))' }} />
            </svg>
          </div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ animation: reducedMotion ? undefined : 'glow-pulse 2.5s ease-in-out infinite', filter: 'drop-shadow(0 0 8px rgba(0,212,255,0.6))' }}>
            <CHRGDIcon size={32} />
          </div>
          {DATA_POINTS.map((pt, i) => (
            <div key={i} className="absolute rounded-full bg-[#00D4FF]"
              style={{ left: `${pt.x}%`, top: `${pt.y}%`, width: pt.s, height: pt.s, animation: reducedMotion ? undefined : `glow-pulse ${1.8 + i * 0.25}s ease-in-out ${pt.d}s infinite` }} />
          ))}
        </div>

        <p ref={textRef} className="text-sm text-white/55 text-center mt-8" style={{ fontFamily: 'var(--font-display)', minHeight: '1.5em' }}>
          Plugging in your charge…
        </p>
        <p className="text-[10px] tracking-[0.22em] uppercase text-white/25 flex items-center gap-2 mt-3" style={{ fontFamily: 'var(--font-display)' }}>
          <span className="inline-block w-1 h-1 rounded-full bg-[#00D4FF]" /> Powered by your charge
        </p>
      </div>
    </div>
  )
}
