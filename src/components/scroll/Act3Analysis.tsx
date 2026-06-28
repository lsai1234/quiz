'use client'

import { useEffect, useRef, useState } from 'react'
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
  { x: 16, y: 24, s: 3, d: 0 }, { x: 84, y: 18, s: 2, d: 0.4 }, { x: 90, y: 60, s: 3, d: 0.8 },
  { x: 78, y: 84, s: 2, d: 0.2 }, { x: 18, y: 80, s: 3, d: 0.6 }, { x: 8, y: 52, s: 2, d: 1.0 },
  { x: 50, y: 8, s: 2, d: 0.3 }, { x: 50, y: 92, s: 2, d: 0.7 },
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
  const streakRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLParagraphElement>(null)
  const [docked, setDocked] = useState(reducedMotion)

  useEffect(() => {
    const minDisplay = reducedMotion ? 900 : 4200
    const dockAt = reducedMotion ? 0 : 1.0 // seconds until the battery is seated
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

    const finish = () => {
      if (finished || !animDone || !ready) return
      finished = true
      if (reducedMotion) { onComplete(); return }
      if (textRef.current) textRef.current.textContent = 'Powering on ⚡'
      gsap.to(proxy, { p: 1, duration: 0.5, ease: 'power2.in', onUpdate: render })
      if (flareRef.current) flareRef.current.style.animation = 'core-flare 0.65s ease-out forwards'
      gsap.to(coreRef.current, { scale: 1.12, duration: 0.28, ease: 'power2.out', delay: 0.18, yoyo: true, repeat: 1 })
      gsap.to([batteryRef.current], { opacity: 0.25, duration: 0.4, ease: 'power2.in', delay: 0.2 })
      gsap.to([vizRef.current], { opacity: 0, scale: 1.06, duration: 0.5, ease: 'power2.in', delay: 0.6, onComplete })
      gsap.to(textRef.current, { opacity: 0, duration: 0.35, ease: 'power2.in', delay: 0.6 })
    }

    const unsub = useQuizStore.subscribe((s) => { if (s.stackReady && !ready) { ready = true; finish() } })
    const minTimer = setTimeout(() => {
      animDone = true
      if (!ready) ready = useQuizStore.getState().stackReady
      finish()
    }, minDisplay)

    let tl: gsap.core.Timeline | null = null

    if (!reducedMotion) {
      tl = gsap.timeline()
      // Stage fades up.
      tl.fromTo(vizRef.current, { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0)
      // Core sits dim until the battery docks.
      gsap.set(coreRef.current, { opacity: 0.32 })

      // 1) Arrive — the battery flies in from the top-right and seats upright.
      gsap.set(batteryRef.current, { x: 150, y: -140, rotate: 26, scale: 0.5, opacity: 0, transformOrigin: 'center' })
      tl.to(batteryRef.current, { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1, duration: 0.95, ease: 'power3.inOut' }, 0.15)
      // motion streak trailing the glide
      if (streakRef.current) {
        tl.fromTo(streakRef.current, { opacity: 0 }, { opacity: 0.5, duration: 0.3, ease: 'power1.out' }, 0.2)
        tl.to(streakRef.current, { opacity: 0, duration: 0.4, ease: 'power1.in' }, 0.75)
      }

      // 2) Dock — connectors spark, core wakes.
      tl.add(() => {
        setDocked(true)
        if (sparkRef.current) sparkRef.current.style.animation = 'charge-burst 0.5s ease-out forwards'
      }, dockAt)
      tl.to(coreRef.current, { opacity: 1, duration: 0.4, ease: 'power2.out' }, dockAt)
      tl.fromTo(coreRef.current, { scale: 0.94 }, { scale: 1, duration: 0.45, ease: 'back.out(1.6)' }, dockAt)

      // 3) Discharge — drain most of the battery into the core.
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
    }

    return () => { unsub(); clearTimeout(minTimer); tl?.kill() }
  }, [onComplete, reducedMotion])

  return (
    <div className="w-full min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-6 overflow-hidden">
      <div ref={vizRef} className="relative flex flex-col items-center" style={{ opacity: 0, width: 320 }}>

        {/* Motion streak (trails the battery's glide) */}
        <div ref={streakRef} className="absolute pointer-events-none" style={{ opacity: 0, top: 6, right: 28, width: 150, height: 2, transform: 'rotate(42deg)', transformOrigin: 'right center', background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.85))', filter: 'blur(2px)' }} />

        {/* Battery */}
        <div ref={batteryRef} className="relative" style={{ width: 70, height: 120 }}>
          <div className="absolute left-1/2 -translate-x-1/2 -top-[7px] rounded-md" style={{ width: 28, height: 7, background: 'rgba(255,255,255,0.32)' }} />
          <div className="absolute inset-0 rounded-2xl border-2 overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.28)', animation: reducedMotion ? undefined : 'battery-hum 2.4s ease-in-out infinite' }}>
            <div ref={fillRef} className="absolute inset-x-0 bottom-0" style={{ height: '100%', background: 'linear-gradient(180deg, #00D4FF, rgba(0,212,255,0.5))' }}>
              {!reducedMotion && <div className="absolute inset-x-0 top-0 h-1/3" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.5), transparent)' }} />}
            </div>
            <div className="absolute inset-0 flex items-center justify-center mix-blend-overlay"><Bolt /></div>
          </div>
          <span ref={pctRef} className="absolute -right-11 top-1/2 -translate-y-1/2 text-sm font-black tabular-nums" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>100%</span>
          {/* contact spark at the terminal */}
          <div ref={sparkRef} className="absolute left-1/2 -translate-x-1/2 -bottom-2 rounded-full pointer-events-none" style={{ width: 22, height: 22, opacity: 0, background: 'radial-gradient(circle, rgba(255,255,255,0.95), rgba(0,212,255,0.6) 50%, transparent 70%)' }} />
        </div>

        {/* Conduit gap — energy arcs leap from the battery into the core when docked */}
        <div className="relative my-1.5" style={{ width: 60, height: 52 }}>
          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0" style={{ width: 2, background: 'rgba(0,212,255,0.12)' }} />
          {docked && !reducedMotion && [0, 0.36, 0.72].map((d, i) => (
            <div key={i} className="absolute left-1/2 top-0 rounded-full" style={{ width: 6, height: 6, background: '#fff', boxShadow: '0 0 10px 2px rgba(0,212,255,0.9)', '--arc': '78px', animation: `arc-fly 0.95s linear ${d}s infinite` } as React.CSSProperties} />
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
          <div className="absolute inset-0" style={{ animation: reducedMotion ? undefined : 'spin-slow 3.5s linear infinite' }}>
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
        <p className="text-[10px] tracking-[0.2em] uppercase text-white/25 flex items-center gap-1.5 mt-3" style={{ fontFamily: 'var(--font-display)' }}>
          <span className="text-[#00D4FF]">✦</span> Powered by your charge
        </p>
      </div>
    </div>
  )
}
