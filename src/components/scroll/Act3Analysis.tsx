'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { useQuizStore } from '@/lib/store'

interface Props {
  onComplete: () => void
  reducedMotion: boolean
}

function CHRGDIcon({ size = 40 }: { size?: number }) {
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

const DATA_POINTS = [
  { x: 18, y: 22, s: 3, delay: 0    },
  { x: 78, y: 14, s: 2, delay: 0.4  },
  { x: 90, y: 50, s: 3, delay: 0.8  },
  { x: 80, y: 80, s: 2, delay: 0.2  },
  { x: 20, y: 78, s: 3, delay: 0.6  },
  { x: 10, y: 46, s: 2, delay: 1.0  },
  { x: 50, y: 6,  s: 2, delay: 0.3  },
  { x: 50, y: 94, s: 2, delay: 0.7  },
  { x: 35, y: 92, s: 1.5, delay: 0.5 },
  { x: 65, y: 8,  s: 1.5, delay: 0.9 },
]

export function Act3Analysis({ onComplete, reducedMotion }: Props) {
  const vizRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLParagraphElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const progressTrackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // The stack is generated (incl. the AI passes) in the background while this
    // screen plays. We only advance once BOTH a minimum play time has elapsed
    // AND the data is ready — so the AI work overlaps the animation instead of
    // adding to it, and we never reveal an unfinished stack.
    const minDisplay = reducedMotion ? 900 : 3400
    let animDone = false
    let ready = useQuizStore.getState().stackReady
    let finished = false

    const finish = () => {
      if (finished || !animDone || !ready) return
      finished = true
      if (reducedMotion) { onComplete(); return }
      gsap.to([textRef.current, progressTrackRef.current], { opacity: 0, duration: 0.35, ease: 'power2.in' })
      gsap.to(vizRef.current, { opacity: 0, scale: 1.08, duration: 0.5, ease: 'power2.in', onComplete })
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

      if (vizRef.current) {
        tl.fromTo(vizRef.current, { opacity: 0, scale: 0.82 }, { opacity: 1, scale: 1, duration: 0.8, ease: 'back.out(1.5)' }, 0)
      }
      if (progressTrackRef.current) {
        tl.fromTo(progressTrackRef.current, { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0.4)
      }

      // Charge-themed status messages. The last one holds if the AI is still working.
      const messages = [
        'Charging your profile…',
        'CHRGD Intelligence is reading you…',
        'Matching you to supplement science…',
        'Almost fully charged…',
      ]
      messages.forEach((msg, i) => {
        tl!.call(() => {
          if (textRef.current) {
            gsap.fromTo(textRef.current, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35 })
            textRef.current.textContent = msg
          }
        }, [], i * 0.78 + 0.4)
      })

      // Progress eases to ~92% over the min display, then holds until ready.
      if (progressRef.current) {
        tl.fromTo(
          progressRef.current,
          { scaleX: 0 },
          { scaleX: 0.92, duration: minDisplay / 1000 - 0.2, ease: 'power1.inOut', transformOrigin: 'left center' },
          0.3,
        )
      }
    }

    return () => { unsub(); clearTimeout(minTimer); tl?.kill() }
  }, [onComplete, reducedMotion])

  return (
    <div className="w-full min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-6">
      {/* Biometric scan visualization */}
      <div ref={vizRef} className="relative w-64 h-64 mb-10" style={{ opacity: 0 }}>

        {/* Pulsing outer rings */}
        {[0.46, 0.66, 0.86].map((r, i) => (
          <div
            key={i}
            className="absolute rounded-full border border-[#00D4FF]/20 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: `${r * 256}px`,
              height: `${r * 256}px`,
              animation: `ring-pulse ${2.4 + i * 0.65}s ease-out ${i * 0.6}s infinite`,
            }}
          />
        ))}

        {/* Rotating arc — outer */}
        <div className="absolute inset-0" style={{ animation: 'spin-slow 3.5s linear infinite' }}>
          <svg viewBox="0 0 256 256" fill="none" className="w-full h-full">
            <circle
              cx="128" cy="128" r="116"
              stroke="#00D4FF" strokeWidth="1.5" strokeLinecap="round"
              strokeDasharray="58 670"
              style={{ filter: 'drop-shadow(0 0 5px rgba(0,212,255,0.8))' }}
            />
          </svg>
        </div>

        {/* Counter-rotating arc — inner */}
        <div className="absolute inset-0" style={{ animation: 'spin-slow 5s linear reverse infinite' }}>
          <svg viewBox="0 0 256 256" fill="none" className="w-full h-full">
            <circle
              cx="128" cy="128" r="86"
              stroke="#00D4FF" strokeWidth="1" strokeLinecap="round"
              strokeDasharray="22 516" opacity="0.45"
            />
          </svg>
        </div>

        {/* Sweeping horizontal scan line */}
        <div className="absolute inset-0 rounded-full overflow-hidden">
          <div
            className="absolute inset-x-0 h-px"
            style={{
              top: '-1px',
              background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.8) 40%, rgba(255,255,255,0.9) 50%, rgba(0,212,255,0.8) 60%, transparent)',
              boxShadow: '0 0 8px 2px rgba(0,212,255,0.4)',
              animation: 'scan-line 2.1s ease-in-out 0.6s infinite',
            }}
          />
        </div>

        {/* Fixed crosshair lines */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-20 h-20 opacity-15">
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#00D4FF]" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-[#00D4FF]" />
          </div>
        </div>

        {/* getCHRGD icon — center, breathing glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ animation: 'glow-pulse 2.5s ease-in-out infinite', filter: 'drop-shadow(0 0 8px rgba(0,212,255,0.6))' }}
        >
          <CHRGDIcon size={40} />
        </div>

        {/* Scattered data points */}
        {DATA_POINTS.map((pt, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-[#00D4FF]"
            style={{
              left: `${pt.x}%`,
              top: `${pt.y}%`,
              width: `${pt.s}px`,
              height: `${pt.s}px`,
              animation: `glow-pulse ${1.8 + i * 0.25}s ease-in-out ${pt.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Progress bar */}
      <div ref={progressTrackRef} className="w-52 h-px bg-white/10 rounded-full overflow-hidden mb-6" style={{ opacity: 0 }}>
        <div
          ref={progressRef}
          className="h-full rounded-full"
          style={{
            background: 'linear-gradient(90deg, rgba(0,212,255,0.6), #00D4FF)',
            transformOrigin: 'left',
            transform: 'scaleX(0)',
            boxShadow: '0 0 8px rgba(0,212,255,0.6)',
          }}
        />
      </div>

      {/* Cycling text */}
      <p
        ref={textRef}
        className="text-sm text-white/55 text-center mb-3"
        style={{ fontFamily: 'var(--font-display)', minHeight: '1.5em' }}
      >
        Connecting to CHRGD Intelligence…
      </p>

      <p
        className="text-[10px] tracking-[0.2em] uppercase text-white/25 flex items-center gap-1.5"
        style={{ fontFamily: 'var(--font-display)', textShadow: '0 0 10px rgba(0,212,255,0.3)' }}
      >
        <span className="text-[#00D4FF]">✦</span> Powered by CHRGD Intelligence
      </p>
    </div>
  )
}
