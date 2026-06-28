'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { useQuizStore } from '@/lib/store'

interface Props {
  onComplete: () => void
  reducedMotion: boolean
}

function CHRGDIcon({ size = 34 }: { size?: number }) {
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

// Lightning bolt only — overlaid on the draining battery.
function Bolt() {
  return (
    <svg width="34" height="46" viewBox="0 0 100 115" fill="none" style={{ filter: 'drop-shadow(0 0 6px rgba(0,0,0,0.4))' }}>
      <path d="M58 22L32 62H51L40 97L76 52H57L58 22Z" fill="white" />
    </svg>
  )
}

const DATA_POINTS = [
  { x: 16, y: 24, s: 3, d: 0 }, { x: 84, y: 18, s: 2, d: 0.4 }, { x: 90, y: 60, s: 3, d: 0.8 },
  { x: 78, y: 84, s: 2, d: 0.2 }, { x: 18, y: 80, s: 3, d: 0.6 }, { x: 8, y: 52, s: 2, d: 1.0 },
  { x: 50, y: 8, s: 2, d: 0.3 }, { x: 50, y: 92, s: 2, d: 0.7 },
]

const CORE_R = 54
const CORE_CIRC = 2 * Math.PI * CORE_R

export function Act3Analysis({ onComplete, reducedMotion }: Props) {
  const vizRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const pctRef = useRef<HTMLSpanElement>(null)
  const coreRingRef = useRef<SVGCircleElement>(null)
  const coreRef = useRef<HTMLDivElement>(null)
  const flareRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const minDisplay = reducedMotion ? 900 : 3600
    let animDone = false
    let ready = useQuizStore.getState().stackReady
    let finished = false

    // p = how much charge has transferred into the machine (0 → 1).
    // Battery charge = 1 - p. Drives the battery fill, the % counter and the
    // machine's progress ring from one source so they can never drift.
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
      // Final discharge: drain the last of the battery into the core, flare, reveal.
      gsap.to(proxy, { p: 1, duration: 0.5, ease: 'power2.in', onUpdate: render })
      if (textRef.current) textRef.current.textContent = 'Powering on ⚡'
      if (flareRef.current) { flareRef.current.style.animation = 'core-flare 0.6s ease-out forwards' }
      gsap.to(coreRef.current, { scale: 1.12, duration: 0.3, ease: 'power2.out', delay: 0.15, yoyo: true, repeat: 1 })
      gsap.to(vizRef.current, { opacity: 0, scale: 1.06, duration: 0.5, ease: 'power2.in', delay: 0.55, onComplete })
      gsap.to(textRef.current, { opacity: 0, duration: 0.35, ease: 'power2.in', delay: 0.55 })
    }

    const unsub = useQuizStore.subscribe((s) => {
      if (s.stackReady && !ready) { ready = true; finish() }
    })
    const minTimer = setTimeout(() => {
      animDone = true
      if (!ready) ready = useQuizStore.getState().stackReady
      finish()
    }, minDisplay)

    let tl: gsap.core.Timeline | null = null
    if (!reducedMotion) {
      tl = gsap.timeline()
      if (vizRef.current) tl.fromTo(vizRef.current, { opacity: 0, scale: 0.86 }, { opacity: 1, scale: 1, duration: 0.7, ease: 'back.out(1.4)' }, 0)

      // Discharge most of the battery over the min display, then hold ~8% until ready.
      tl.to(proxy, { p: 0.92, duration: minDisplay / 1000 - 0.4, ease: 'power1.inOut', onUpdate: render }, 0.3)

      const messages = [
        'Plugging in your charge…',
        'Powering CHRGD Intelligence…',
        'Reading your profile…',
        'Building your stack…',
      ]
      messages.forEach((msg, i) => {
        tl!.call(() => {
          if (textRef.current) {
            gsap.fromTo(textRef.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35 })
            textRef.current.textContent = msg
          }
        }, [], i * ((minDisplay / 1000 - 0.4) / 4) + 0.4)
      })
    }

    return () => { unsub(); clearTimeout(minTimer); tl?.kill() }
  }, [onComplete, reducedMotion])

  return (
    <div className="w-full min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-6">
      <div ref={vizRef} className="relative flex flex-col items-center" style={{ opacity: 0 }}>

        {/* Battery (drains top→bottom into the machine) */}
        <div className="relative" style={{ width: 78, height: 132 }}>
          {/* cap */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-[7px] rounded-md" style={{ width: 30, height: 7, background: 'rgba(255,255,255,0.3)' }} />
          {/* body */}
          <div className="absolute inset-0 rounded-2xl border-2 overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.25)', animation: reducedMotion ? undefined : 'battery-hum 2.4s ease-in-out infinite' }}>
            {/* fill */}
            <div
              ref={fillRef}
              className="absolute inset-x-0 bottom-0"
              style={{ height: '100%', background: 'linear-gradient(180deg, #00D4FF, rgba(0,212,255,0.55))', transition: 'none' }}
            >
              {!reducedMotion && (
                <div className="absolute inset-x-0 h-1/3" style={{ top: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.5), transparent)' }} />
              )}
            </div>
            {/* bolt overlay */}
            <div className="absolute inset-0 flex items-center justify-center mix-blend-overlay">
              <Bolt />
            </div>
          </div>
          {/* % counter */}
          <span ref={pctRef} className="absolute -right-12 top-1/2 -translate-y-1/2 text-sm font-black tabular-nums" style={{ color: '#00D4FF', fontFamily: 'var(--font-display)' }}>100%</span>
        </div>

        {/* Conduit — energy flows down from battery into the machine */}
        <div className="relative my-1" style={{ width: 2, height: 64, background: 'rgba(0,212,255,0.12)' }}>
          {!reducedMotion && [0, 0.5, 1].map((d, i) => (
            <div key={i} className="absolute left-1/2 -translate-x-1/2 rounded-full"
              style={{ top: -4, width: 5, height: 5, background: '#00D4FF', boxShadow: '0 0 8px 2px rgba(0,212,255,0.8)', animation: `conduit-flow 1.1s linear ${d}s infinite` }} />
          ))}
        </div>

        {/* The machine core */}
        <div ref={coreRef} className="relative" style={{ width: 200, height: 200 }}>
          {/* flare burst (fires on power-on) */}
          <div ref={flareRef} className="absolute top-1/2 left-1/2 rounded-full pointer-events-none" style={{ width: 200, height: 200, opacity: 0, background: 'radial-gradient(circle, rgba(0,212,255,0.55), transparent 60%)' }} />

          {[0.5, 0.72, 0.94].map((r, i) => (
            <div key={i} className="absolute rounded-full border border-[#00D4FF]/20 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ width: `${r * 200}px`, height: `${r * 200}px`, animation: reducedMotion ? undefined : `ring-pulse ${2.4 + i * 0.6}s ease-out ${i * 0.5}s infinite` }} />
          ))}

          {/* progress ring — fills as the battery drains */}
          <svg viewBox="0 0 200 200" className="absolute inset-0 -rotate-90 w-full h-full">
            <circle cx="100" cy="100" r={CORE_R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
            <circle ref={coreRingRef} cx="100" cy="100" r={CORE_R} fill="none" stroke="#00D4FF" strokeWidth="3" strokeLinecap="round"
              strokeDasharray={CORE_CIRC} strokeDashoffset={CORE_CIRC} style={{ filter: 'drop-shadow(0 0 5px rgba(0,212,255,0.8))' }} />
          </svg>

          {/* rotating arc */}
          <div className="absolute inset-0" style={{ animation: reducedMotion ? undefined : 'spin-slow 3.5s linear infinite' }}>
            <svg viewBox="0 0 200 200" fill="none" className="w-full h-full">
              <circle cx="100" cy="100" r="88" stroke="#00D4FF" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="46 520" style={{ filter: 'drop-shadow(0 0 5px rgba(0,212,255,0.8))' }} />
            </svg>
          </div>

          {/* getCHRGD core icon */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ animation: reducedMotion ? undefined : 'glow-pulse 2.5s ease-in-out infinite', filter: 'drop-shadow(0 0 8px rgba(0,212,255,0.6))' }}>
            <CHRGDIcon size={34} />
          </div>

          {/* data points */}
          {DATA_POINTS.map((pt, i) => (
            <div key={i} className="absolute rounded-full bg-[#00D4FF]"
              style={{ left: `${pt.x}%`, top: `${pt.y}%`, width: pt.s, height: pt.s, animation: reducedMotion ? undefined : `glow-pulse ${1.8 + i * 0.25}s ease-in-out ${pt.d}s infinite` }} />
          ))}
        </div>

        {/* Status text */}
        <p ref={textRef} className="text-sm text-white/55 text-center mt-9" style={{ fontFamily: 'var(--font-display)', minHeight: '1.5em' }}>
          Plugging in your charge…
        </p>
        <p className="text-[10px] tracking-[0.2em] uppercase text-white/25 flex items-center gap-1.5 mt-3" style={{ fontFamily: 'var(--font-display)' }}>
          <span className="text-[#00D4FF]">✦</span> Powered by your charge
        </p>
      </div>
    </div>
  )
}
