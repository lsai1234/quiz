'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * The getCHRGD signature, redesigned: a slim vertical "charge rail" fixed to the
 * right edge of the screen and always in frame. It fills from the bottom up as
 * you answer, so the charge is permanently visible — no longer a tiny top-corner
 * icon that scrolls out of shot. Editorial-minimal: one restrained accent, a soft
 * glow, a quiet rotated percentage. The fill carries a slow upward energy
 * stream; each answer sends a bright streak racing up it (+ a pulse and haptic)
 * and rolls the percentage up rather than snapping it. In Act 3 the
 * rail-battery detaches and flies into the machine.
 * Reduced-motion = static fill, instant percentage.
 */

const ACCENT = '#00D4FF'

interface Props {
  /** 0–100. */
  charge: number
  /** Change this (e.g. increment) to trigger a surge pulse + haptic. */
  surgeKey?: number
  reducedMotion?: boolean
}

/** Rolls the displayed number toward the target over ~600ms. */
function useRollingNumber(target: number, instant: boolean): number {
  const [shown, setShown] = useState(target)
  const shownRef = useRef(target)

  useEffect(() => {
    if (instant) { shownRef.current = target; setShown(target); return }
    const from = shownRef.current
    if (from === target) return
    const t0 = performance.now()
    const dur = 600
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / dur)
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

export function ChargeRail({ charge, surgeKey = 0, reducedMotion }: Props) {
  const [pulse, setPulse] = useState(0)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) { first.current = false; return }
    setPulse((p) => p + 1)
    if (!reducedMotion && typeof navigator !== 'undefined') navigator.vibrate?.(6)
  }, [surgeKey, reducedMotion])

  const pct = Math.max(0, Math.min(100, Math.round(charge)))
  const shownPct = useRollingNumber(pct, !!reducedMotion)

  return (
    <div
      aria-label={`${pct}% charged`}
      role="progressbar"
      aria-valuenow={pct}
      className="fixed right-0 top-0 z-30 pointer-events-none select-none flex items-center justify-center"
      style={{ height: '100dvh', width: 42 }}
    >
      <div className="flex flex-col items-center" style={{ height: 'min(56vh, 420px)' }}>
        {/* terminal cap */}
        <div className="mb-1.5 rounded-full" style={{ width: 11, height: 4, background: 'rgba(255,255,255,0.16)' }} />

        {/* track */}
        <div
          className="relative flex-1 overflow-hidden"
          style={{
            width: 6,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.045)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
          }}
        >
          {/* quarter ticks — quiet waypoints up the track */}
          {[25, 50, 75].map((t) => (
            <div
              key={`tick-${t}`}
              className="absolute inset-x-0"
              style={{ bottom: `${t}%`, height: 1, background: 'rgba(255,255,255,0.10)' }}
            />
          ))}

          {/* fill (bottom -> top) */}
          <div
            className="absolute inset-x-0 bottom-0 overflow-hidden"
            style={{
              height: `${pct}%`,
              minHeight: pct > 0 ? 6 : 0,
              borderRadius: 999,
              background: `linear-gradient(to top, ${ACCENT}, rgba(0,212,255,0.5))`,
              boxShadow: '0 0 12px rgba(0,212,255,0.4)',
              transition: reducedMotion ? undefined : 'height 720ms cubic-bezier(0.22,1,0.36,1)',
            }}
          >
            {/* energy stream — faint bands drifting upward inside the fill */}
            {!reducedMotion && (
              <div
                className="absolute inset-x-0"
                style={{
                  top: 0,
                  height: 'calc(100% + 28px)',
                  background: 'repeating-linear-gradient(to top, transparent 0 18px, rgba(255,255,255,0.16) 18px 22px, transparent 22px 28px)',
                  animation: 'rail-flow 1.6s linear infinite',
                }}
              />
            )}

            {/* answer streak — a bright charge racing up the fill */}
            {!reducedMotion && pulse > 0 && (
              <div
                key={`streak-${pulse}`}
                className="absolute inset-x-0"
                style={{
                  height: '55%',
                  minHeight: 26,
                  background: 'linear-gradient(to top, transparent, rgba(255,255,255,0.85), transparent)',
                  animation: 'rail-rise 0.7s cubic-bezier(0.3,0.7,0.4,1) forwards',
                }}
              />
            )}

            {/* leading-edge highlight */}
            <div
              className="absolute inset-x-0 top-0 rounded-full"
              style={{ height: 9, background: 'linear-gradient(to bottom, rgba(255,255,255,0.7), transparent)' }}
            />
          </div>

          {/* surge pulse at the leading edge */}
          {!reducedMotion && pulse > 0 && (
            <div
              key={pulse}
              className="absolute inset-x-[-6px]"
              style={{
                bottom: `calc(${pct}% - 9px)`,
                height: 18,
                background: 'radial-gradient(circle, rgba(0,212,255,0.55), transparent 70%)',
                animation: 'rail-surge 0.6s ease-out forwards',
              }}
            />
          )}
        </div>

        {/* quiet rotated percentage — rolls up rather than snapping */}
        <div className="mt-3" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          <span
            className="text-[10px] font-semibold tabular-nums tracking-[0.12em]"
            style={{ color: 'rgba(0,212,255,0.85)', fontFamily: 'var(--font-display)' }}
          >
            {shownPct}%
          </span>
        </div>
      </div>
    </div>
  )
}
