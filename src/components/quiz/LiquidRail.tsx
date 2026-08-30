'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * CHRGD LQD — the liquid twin of the ChargeRail. Same slim right-edge column,
 * but instead of a battery charging it's a glass tube FILLING with liquid as you
 * answer: a wavy meniscus surface, bubbles rising through the fill, a droplet
 * cap, and a quiet "% poured" readout. Each answer sends a ripple across the
 * surface (+ a soft haptic). This is what makes the drinks quiz feel liquid the
 * whole way through. Reduced-motion = a still fill, instant number.
 */

const ACCENT = '#00D4FF'

interface Props {
  /** 0–100 — how full the tube is. */
  level: number
  /** Change this (per answer) to ripple the surface + haptic. */
  surgeKey?: number
  reducedMotion?: boolean
}

function useRollingNumber(target: number, instant: boolean): number {
  const [shown, setShown] = useState(target)
  const shownRef = useRef(target)
  useEffect(() => {
    if (instant) { shownRef.current = target; setShown(target); return }
    const from = shownRef.current
    if (from === target) return
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / 600)
      const eased = 1 - Math.pow(1 - t, 3)
      const v = Math.round(from + (target - from) * eased)
      shownRef.current = v
      setShown(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, instant])
  return shown
}

export function LiquidRail({ level, surgeKey = 0, reducedMotion }: Props) {
  const [pulse, setPulse] = useState(0)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    setPulse((p) => p + 1)
    if (!reducedMotion && typeof navigator !== 'undefined') navigator.vibrate?.(6)
  }, [surgeKey, reducedMotion])

  const pct = Math.max(0, Math.min(100, Math.round(level)))
  const shownPct = useRollingNumber(pct, !!reducedMotion)

  return (
    <div
      aria-label={`${pct}% poured`}
      role="progressbar"
      aria-valuenow={pct}
      className="fixed right-0 top-0 z-30 pointer-events-none select-none flex items-center justify-center"
      style={{ height: 'var(--app-height, 100dvh)', width: 42 }}
    >
      <div className="flex flex-col items-center" style={{ height: 'min(56vh, 420px)' }}>
        {/* droplet cap */}
        <svg width="12" height="14" viewBox="0 0 12 14" className="mb-1.5" style={{ filter: 'drop-shadow(0 0 5px rgba(0,212,255,0.5))' }}>
          <path d="M6 1 2.5 6.5a4 4 0 1 0 7 0z" fill={ACCENT} opacity="0.85" />
        </svg>

        {/* glass tube */}
        <div
          className="relative flex-1 overflow-hidden"
          style={{ width: 8, borderRadius: 999, background: 'rgba(255,255,255,0.05)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.07)' }}
        >
          {/* quarter waypoints */}
          {[25, 50, 75].map((t) => (
            <div key={`tick-${t}`} className="absolute inset-x-0" style={{ bottom: `${t}%`, height: 1, background: 'rgba(255,255,255,0.10)' }} />
          ))}

          {/* the liquid */}
          <div
            className="absolute inset-x-0 bottom-0"
            style={{
              height: `${pct}%`,
              minHeight: pct > 0 ? 8 : 0,
              background: `linear-gradient(to top, ${ACCENT}, rgba(0,212,255,0.55))`,
              boxShadow: '0 0 12px rgba(0,212,255,0.45)',
              transition: reducedMotion ? undefined : 'height 720ms cubic-bezier(0.22,1,0.36,1)',
            }}
          >
            {/* meniscus surface — a wave riding the top of the fill */}
            <div
              className="absolute left-1/2 -top-[3px] h-2 rounded-[50%]"
              style={{
                width: '200%',
                marginLeft: '-100%',
                background: ACCENT,
                animation: reducedMotion ? undefined : 'lqd-meniscus-drift 3s linear infinite',
              }}
            />
            {/* bubbles rising through the liquid */}
            {!reducedMotion && pct > 8 && [0, 1, 2].map((i) => (
              <span
                key={`bub-${i}`}
                className="absolute rounded-full"
                style={{
                  left: `${25 + i * 22}%`,
                  bottom: 0,
                  width: 2.5, height: 2.5,
                  background: 'rgba(255,255,255,0.8)',
                  ['--sway' as string]: `${i % 2 ? 2 : -2}px`,
                  animation: `bubble-rise ${2.6 + i * 0.7}s ease-in ${i * 0.9}s infinite`,
                }}
              />
            ))}
            {/* answer ripple — a bright band crossing the surface */}
            {!reducedMotion && pulse > 0 && (
              <div
                key={`ripple-${pulse}`}
                className="absolute inset-x-0 top-0 rounded-full"
                style={{ height: 10, background: 'linear-gradient(to bottom, rgba(255,255,255,0.9), transparent)', animation: 'rail-surge 0.6s ease-out forwards' }}
              />
            )}
          </div>
        </div>

        {/* rotated "% poured" */}
        <div className="mt-3" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          <span className="text-[10px] font-semibold tabular-nums tracking-[0.12em]" style={{ color: 'rgba(0,212,255,0.85)', fontFamily: 'var(--font-display)' }}>
            {shownPct}% poured
          </span>
        </div>
      </div>
    </div>
  )
}
