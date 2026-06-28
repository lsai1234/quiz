'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * The getCHRGD signature quirk: a battery that visibly CHARGES as you answer.
 * Each answer surges the meter (pulse + haptic + a "+N%" flash); it climbs the
 * whole way through the quiz and "powers on" the reveal. Reduced-motion safe.
 */

const ACCENT = '#00D4FF'

interface Props {
  /** 0–100. */
  charge: number
  /** Change this (e.g. increment) to trigger a surge pulse + haptic. */
  surgeKey?: number
  /** The +N% to flash on the last surge. */
  delta?: number
  reducedMotion?: boolean
}

export function ChargeMeter({ charge, surgeKey = 0, delta = 0, reducedMotion }: Props) {
  const [pulse, setPulse] = useState(0)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) { first.current = false; return }
    setPulse((p) => p + 1)
    if (!reducedMotion && typeof navigator !== 'undefined') navigator.vibrate?.(8)
  }, [surgeKey, reducedMotion])

  const pct = Math.max(0, Math.min(100, Math.round(charge)))

  return (
    <div className="relative flex items-center gap-1.5" aria-label={`${pct}% charged`}>
      {/* Battery — a liquid charge cell */}
      <div className="relative" style={{ width: 64, height: 22, animation: reducedMotion ? undefined : 'battery-hum 2.6s ease-in-out infinite', borderRadius: 7 }}>
        <div className="absolute inset-0 rounded-[7px] border" style={{ borderColor: 'rgba(255,255,255,0.3)' }} />
        {/* Cap nub */}
        <div className="absolute" style={{ right: -4, top: 7, width: 3, height: 8, borderRadius: 2, background: 'rgba(255,255,255,0.32)' }} />
        {/* Liquid fill */}
        <div
          className="absolute top-[3px] bottom-[3px] left-[3px] rounded-[4px] overflow-hidden"
          style={{
            width: `calc(${pct}% - 6px)`,
            minWidth: pct > 0 ? 5 : 0,
            background: `linear-gradient(90deg, rgba(0,212,255,0.6), ${ACCENT})`,
            boxShadow: '0 0 10px rgba(0,212,255,0.7)',
            transition: 'width 650ms cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          {/* meniscus highlight at the leading edge — gives it a 'liquid' read */}
          {!reducedMotion && (
            <div className="absolute right-0 top-0 bottom-0" style={{ width: 6, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.7))', animation: 'liquid-wave 1.6s ease-in-out infinite' }} />
          )}
          {!reducedMotion && (
            <div className="absolute inset-y-0 w-1/2" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)', animation: 'charge-shimmer 1.9s linear infinite' }} />
          )}
        </div>
        {/* Surge burst ring */}
        {!reducedMotion && pulse > 0 && (
          <div key={pulse} className="absolute inset-0 rounded-[7px] pointer-events-none" style={{ border: `1px solid ${ACCENT}`, animation: 'charge-burst 0.5s ease-out forwards' }} />
        )}
      </div>

      <span className="text-[11px] font-bold tabular-nums" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>{pct}%</span>
      <span className="text-[11px] leading-none" aria-hidden style={{ color: ACCENT }}>⚡</span>

      {/* +N% flash */}
      {!reducedMotion && delta > 0 && pulse > 0 && (
        <span key={`d${pulse}`} className="absolute -top-3 right-0 text-[10px] font-black pointer-events-none" style={{ color: ACCENT, fontFamily: 'var(--font-display)', animation: 'float-up-fade 0.9s ease-out forwards' }}>
          +{delta}%
        </span>
      )}
    </div>
  )
}
