'use client'

import { useEffect, useState } from 'react'

/**
 * Ambient charge aura — a soft cyan edge-glow behind the quiz that intensifies as
 * the battery fills, so the whole screen visibly "charges up" as you answer.
 * Deliberately low-opacity + peripheral so it never competes with the question.
 */
interface Props {
  charge: number
  surgeKey?: number
  reducedMotion?: boolean
}

export function ChargeAura({ charge, surgeKey = 0, reducedMotion }: Props) {
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    if (reducedMotion) return
    setPulse(true)
    const t = setTimeout(() => setPulse(false), 550)
    return () => clearTimeout(t)
  }, [surgeKey, reducedMotion])

  // Intensity climbs with charge; a brief lift on each answer.
  const base = 0.1 + (Math.max(0, Math.min(100, charge)) / 100) * 0.5
  const intensity = pulse ? Math.min(0.95, base + 0.25) : base

  return (
    <div
      aria-hidden
      className="fixed inset-0 pointer-events-none"
      style={{
        zIndex: 0,
        opacity: intensity,
        transition: 'opacity 650ms ease',
        boxShadow: 'inset 0 0 150px 8px rgba(0,212,255,0.5)',
        background:
          'radial-gradient(130% 75% at 50% 118%, rgba(0,212,255,0.20), transparent 60%)',
      }}
    />
  )
}
