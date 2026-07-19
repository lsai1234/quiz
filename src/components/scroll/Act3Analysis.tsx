'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useQuizStore } from '@/lib/store'
import { CHRGDMark } from '@/components/brand/CHRGDLogo'

interface Props {
  onComplete: () => void
  reducedMotion: boolean
}

const ACCENT = '#00D4FF'

// Etched into the glass — an outline, not a filled sticker.
function Bolt() {
  return (
    <svg width="24" height="32" viewBox="0 0 100 115" fill="none">
      <path
        d="M58 22L32 62H51L40 97L76 52H57L58 22Z"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="4"
        strokeLinejoin="round"
        fill="none"
        style={{ filter: 'drop-shadow(0 0 5px rgba(0,212,255,0.35))' }}
      />
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
  const ambientRef = useRef<HTMLDivElement>(null)
  const screenFlashRef = useRef<HTMLDivElement>(null)
  const waveWrapRef = useRef<HTMLDivElement>(null)
  const bubbleWrapRef = useRef<HTMLDivElement>(null)
  const readoutRef = useRef<HTMLDivElement>(null)
  const [docked, setDocked] = useState(reducedMotion)

  useLayoutEffect(() => {
    const minDisplay = reducedMotion ? 900 : 4200
    const dockAt = reducedMotion ? 0 : 1.5 // seconds until the cell is seated
    let animDone = false
    let ready = useQuizStore.getState().stackReady
    let finished = false

    // p = charge transferred into the machine (0→1). Battery charge = 1 − p.
    // One source drives the battery fill, the % counter, the core ring and the
    // ambient room glow — the scene itself brightens as the machine powers up.
    const proxy = { p: 0 }
    const render = () => {
      const charge = 1 - proxy.p
      if (fillRef.current) fillRef.current.style.height = `${Math.max(0, charge * 100)}%`
      if (pctRef.current) pctRef.current.textContent = `${Math.round(charge * 100)}%`
      if (coreRingRef.current) coreRingRef.current.style.strokeDashoffset = String(CORE_CIRC * (1 - proxy.p))
      if (ambientRef.current && !reducedMotion) ambientRef.current.style.opacity = String(proxy.p * 0.75)
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
      // The machine wakes: a full-screen flash rides the last of the charge.
      if (screenFlashRef.current) screenFlashRef.current.style.animation = 'power-flash 0.8s ease-out 0.3s forwards'
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

      // Start the cell AS the charge rail: slim, pinned to the screen edge,
      // the glass details hidden so only the cyan fill reads (exactly the rail).
      const vw = window.innerWidth
      const vh = window.innerHeight
      const H = Math.min(vh * 0.56, 420) // matches ChargeRail's inner height
      gsap.set(batteryRef.current, { position: 'fixed', margin: 0, zIndex: 30, opacity: 1, left: vw - 24, top: (vh - H) / 2 + 10, width: 6, height: H - 46, rotation: 0, transformOrigin: '50% 50%' })
      gsap.set([capRef.current, highlightRef.current, readoutRef.current, boltRef.current, waveWrapRef.current, bubbleWrapRef.current], { opacity: 0 })
      if (fillRef.current) fillRef.current.style.height = '92%'

      // Phase 1 — the rail snaps free and flies as a slim comet, leaning into
      // a curved path (x and y run on different eases, so the route arcs
      // rather than beelines).
      tl.to(batteryRef.current, { left: slot.left + slot.width / 2 - 7, width: 14, rotation: -8, duration: 0.9, ease: 'power3.out' }, 0)
      tl.to(batteryRef.current, { top: slot.top + 12, height: slot.height - 24, duration: 0.9, ease: 'power2.inOut' }, 0)

      // Phase 2 — it plumps into the capsule with a jelly overshoot…
      tl.to(batteryRef.current, { left: slot.left, top: slot.top, width: slot.width, height: slot.height, rotation: 0, duration: 0.55, ease: 'back.out(2.4)' }, 0.9)
      // …and settles into the dock with a tiny shimmy.
      tl.to(batteryRef.current, { rotation: 1.8, duration: 0.13, ease: 'power1.inOut' }, 1.5)
      tl.to(batteryRef.current, { rotation: 0, duration: 0.55, ease: 'elastic.out(1.2, 0.3)' }, 1.63)

      // Top the charge off to full as it becomes the cell.
      const fillProxy = { h: 92 }
      tl.to(fillProxy, { h: 100, duration: 1.0, ease: 'power1.out', onUpdate: () => { if (fillRef.current) fillRef.current.style.height = `${fillProxy.h}%` } }, 0.15)

      // The glass details and the liquid's life emerge as the shape resolves.
      tl.to(capRef.current, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 1.0)
      tl.to(highlightRef.current, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 1.0)
      tl.to(boltRef.current, { opacity: 0.75, duration: 0.5, ease: 'power2.out' }, 1.05)
      tl.to([waveWrapRef.current, bubbleWrapRef.current], { opacity: 1, duration: 0.6, ease: 'power2.out' }, 1.1)
      tl.to(readoutRef.current, { opacity: 1, duration: 0.4, ease: 'power2.out' }, 1.25)

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

      {/* Ambient room glow — the scene brightens as charge transfers into the
          machine (opacity driven from the same source as the battery fill). */}
      <div
        ref={ambientRef}
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          opacity: 0,
          background: 'radial-gradient(75% 55% at 50% 58%, rgba(0,212,255,0.13), rgba(0,212,255,0.035) 55%, transparent 75%)',
        }}
      />

      {/* Power-on flash — fires once as the machine wakes at the end. */}
      <div
        ref={screenFlashRef}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-40"
        style={{
          opacity: 0,
          background: 'radial-gradient(60% 45% at 50% 55%, rgba(255,255,255,0.9), rgba(0,212,255,0.5) 45%, transparent 75%)',
        }}
      />

      {/* Charge cell — a single element that starts as the quiz charge rail and
          becomes this glass capsule of liquid charge (fixed, sat over its
          in-flow slot below). Capsule on purpose: it's a supplement brand.
          Rendering is layered like real glass: aura behind, crisp static rim
          on the shell (never animated away), liquid with depth + caustic pool,
          etched bolt, specular streaks. */}
      <div ref={batteryRef} style={{ position: 'fixed', zIndex: 30, width: 68, height: 120, opacity: reducedMotion ? 1 : 0 }}>
        {/* aura — the breathing glow lives BEHIND the glass so the rim stays crisp */}
        {!reducedMotion && (
          <div
            aria-hidden
            className="absolute rounded-full pointer-events-none"
            style={{
              inset: -14,
              background: 'radial-gradient(ellipse at 50% 60%, rgba(0,212,255,0.28), transparent 68%)',
              filter: 'blur(6px)',
              animation: 'glow-pulse 3.2s ease-in-out infinite',
            }}
          />
        )}
        {/* terminal collar — brushed metal, hairline edge */}
        <div
          ref={capRef}
          className="absolute left-1/2 -translate-x-1/2 -top-[6px] rounded-full"
          style={{
            width: 20, height: 7,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0.12) 55%, rgba(255,255,255,0.3))',
            boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.35), 0 1px 2px rgba(0,0,0,0.5)',
          }}
        />
        {/* glass shell — static, layered lighting: hairline rim, top edge catch,
            depth shadow low in the vessel */}
        <div
          ref={shellRef}
          className="absolute inset-0 overflow-hidden"
          style={{
            borderRadius: 999,
            background: 'linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 40%, rgba(0,212,255,0.04) 75%, rgba(255,255,255,0.05) 100%)',
            boxShadow: [
              'inset 0 0 0 1px rgba(255,255,255,0.20)',
              'inset 0 1.5px 0 rgba(255,255,255,0.22)',
              'inset 0 -10px 18px rgba(0,0,0,0.35)',
              'inset 0 12px 20px -12px rgba(255,255,255,0.10)',
            ].join(', '),
          }}
        >
          {/* liquid charge — bright at the surface, deep below, light pooling
              at the base like a lit vessel */}
          <div ref={fillRef} className="absolute inset-x-0 bottom-0" style={{ height: '100%', background: 'linear-gradient(180deg, rgba(90,230,255,0.95) 0%, rgba(0,180,222,0.85) 34%, rgba(0,116,158,0.8) 100%)' }}>
            {/* caustic pool — light collecting at the bottom of the vessel */}
            <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height: 30, background: 'radial-gradient(70% 110% at 50% 108%, rgba(140,245,255,0.55), transparent 70%)' }} />
            {/* meniscus — a calm, fine ripple: two long low waves out of phase */}
            {!reducedMotion && (
              <div ref={waveWrapRef} className="absolute inset-x-0 pointer-events-none" style={{ top: -5, height: 10 }}>
                <div className="absolute top-0 h-full" style={{ left: 0, width: '200%', animation: 'wave-drift 3.4s linear infinite' }}>
                  <svg width="100%" height="100%" viewBox="0 0 400 10" preserveAspectRatio="none">
                    <path d="M0,5 Q12.5,2.8 25,5 T50,5 T75,5 T100,5 T125,5 T150,5 T175,5 T200,5 T225,5 T250,5 T275,5 T300,5 T325,5 T350,5 T375,5 T400,5 L400,10 L0,10 Z" fill="rgba(90,230,255,0.95)" />
                  </svg>
                </div>
                <div className="absolute top-0 h-full" style={{ left: 0, width: '200%', animation: 'wave-drift 5.6s linear infinite reverse', opacity: 0.35 }}>
                  <svg width="100%" height="100%" viewBox="0 0 400 10" preserveAspectRatio="none">
                    <path d="M0,5.5 Q12.5,3.4 25,5.5 T50,5.5 T75,5.5 T100,5.5 T125,5.5 T150,5.5 T175,5.5 T200,5.5 T225,5.5 T250,5.5 T275,5.5 T300,5.5 T325,5.5 T350,5.5 T375,5.5 T400,5.5 L400,10 L0,10 Z" fill="rgba(255,255,255,0.55)" />
                  </svg>
                </div>
              </div>
            )}
            {/* surface glint — one crisp hairline at the waterline */}
            <div className="absolute inset-x-1 top-0 pointer-events-none" style={{ height: 1.5, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.75) 30%, rgba(255,255,255,0.75) 70%, transparent)' }} />
            {/* champagne bubbles — tiny, slow, clipped to the liquid */}
            {!reducedMotion && (
              <div ref={bubbleWrapRef} className="absolute inset-0 overflow-hidden pointer-events-none">
                {([
                  { left: '26%', s: 2.5, dur: 3.6, delay: 0,   sway: '3px'  },
                  { left: '55%', s: 2,   dur: 4.4, delay: 1.3, sway: '-3px' },
                  { left: '70%', s: 3,   dur: 3.2, delay: 2.1, sway: '2px'  },
                  { left: '40%', s: 2,   dur: 4.0, delay: 2.9, sway: '-2px' },
                ]).map((b, i) => (
                  <div
                    key={`bubble-${i}`}
                    className="absolute rounded-full"
                    style={{
                      left: b.left, bottom: 5, width: b.s, height: b.s,
                      background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.95), rgba(255,255,255,0.2))',
                      animation: `bubble-rise ${b.dur}s ease-in-out ${b.delay}s infinite`,
                      ['--sway' as string]: b.sway,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          {/* bolt — etched into the glass */}
          <div ref={boltRef} className="absolute inset-0 flex items-center justify-center"><Bolt /></div>
          {/* specular streaks — primary tall catch left, small counter-catch right */}
          <div ref={highlightRef} className="absolute inset-0 pointer-events-none">
            <div className="absolute rounded-full" style={{ top: 10, bottom: 34, left: 7, width: 2.5, background: 'linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0.06) 70%, transparent)' }} />
            <div className="absolute rounded-full" style={{ top: 14, right: 9, width: 1.5, height: 22, background: 'linear-gradient(180deg, rgba(255,255,255,0.35), transparent)' }} />
          </div>
        </div>
        {/* instrument readout — quiet, engineered */}
        <div ref={readoutRef} className="absolute top-1/2 -translate-y-1/2" style={{ left: 'calc(100% + 14px)' }}>
          <div className="absolute top-1/2 -translate-y-1/2" style={{ left: -10, width: 6, height: 1, background: 'rgba(255,255,255,0.25)' }} />
          <div className="text-[8px] font-semibold tracking-[0.3em] uppercase" style={{ color: 'rgba(255,255,255,0.30)', fontFamily: 'var(--font-display)' }}>Cell</div>
          <span ref={pctRef} className="text-[15px] font-semibold tabular-nums leading-tight" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>100%</span>
        </div>
        {/* contact spark at the terminal */}
        <div ref={sparkRef} className="absolute left-1/2 -translate-x-1/2 -bottom-2 rounded-full pointer-events-none" style={{ width: 22, height: 22, opacity: 0, background: 'radial-gradient(circle, rgba(255,255,255,0.95), rgba(0,212,255,0.6) 50%, transparent 70%)' }} />
      </div>

      <div ref={vizRef} className="relative flex flex-col items-center" style={{ opacity: reducedMotion ? 1 : 0, width: 320 }}>

        {/* Battery slot — reserves the docked battery's space in the column */}
        <div ref={slotRef} aria-hidden style={{ width: 68, height: 120 }} />

        {/* Conduit gap — the machine drinks: droplets of liquid charge drip from
            the cell and fall into the core when docked */}
        <div className="relative my-1.5" style={{ width: 60, height: 52 }}>
          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0" style={{ width: 1, background: 'linear-gradient(180deg, rgba(0,212,255,0.28), rgba(0,212,255,0.06))' }} />
          {docked && !reducedMotion && [0, 0.5, 1.0].map((d, i) => (
            <div
              key={`drip-${i}`}
              className="absolute left-1/2 top-0"
              style={{ '--drip': '74px', animation: `drip-fall 1.5s cubic-bezier(0.5,0,0.85,0.5) ${d}s infinite` } as React.CSSProperties}
            >
              {/* motion trail */}
              <div
                className="absolute left-1/2 -translate-x-1/2 rounded-full"
                style={{ bottom: 5, width: 1.5, height: 16, background: 'linear-gradient(to top, rgba(0,212,255,0.55), transparent)' }}
              />
              {/* droplet — teardrop, bright core */}
              <div
                style={{
                  width: 5, height: 7,
                  borderRadius: '50% 50% 50% 50% / 62% 62% 38% 38%',
                  background: 'radial-gradient(circle at 42% 32%, rgba(255,255,255,0.95), rgba(0,212,255,0.9) 55%, rgba(0,170,210,0.85))',
                  boxShadow: '0 0 6px 1px rgba(0,212,255,0.55)',
                }}
              />
            </div>
          ))}
        </div>

        {/* Machine core */}
        <div ref={coreRef} className="relative" style={{ width: 190, height: 190 }}>
          <div ref={flareRef} className="absolute top-1/2 left-1/2 rounded-full pointer-events-none" style={{ width: 190, height: 190, opacity: 0, background: 'radial-gradient(circle, rgba(0,212,255,0.55), transparent 60%)' }} />
          {/* absorb pulses — rings contracting into the core as each droplet
              lands (same 1.5s cycle as drip-fall, offset to the splash moment) */}
          {docked && !reducedMotion && [0, 0.5, 1.0].map((d, i) => (
            <div
              key={`absorb-${i}`}
              className="absolute top-1/2 left-1/2 rounded-full pointer-events-none border border-[#00D4FF]/50"
              style={{ width: 128, height: 128, opacity: 0, animation: `core-absorb 1.5s ease-in ${d + 1.2}s infinite` }}
            />
          ))}
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
            <CHRGDMark size={32} />
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
