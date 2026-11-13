'use client'

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/** How many sparks leave the ring when it fills. */
const SPARKS = 14

/**
 * The charge ring: `total` things to do, as that many segments; `done` of
 * them lit, with the accent's gradient and a glow. It pours in on arrival
 * and each new segment lights as it's ticked. Filling the last one (not
 * arriving full) swells the halo once and lets a burst of sparks go.
 *
 * Its name is the label; the ring is decoration round the words inside.
 */
export function ChargeRing({ done, total, size, stroke, label, children }: { done: number; total: number; size: number; stroke: number; label: string; children?: ReactNode }) {
  const id = useId()
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const n = Math.max(1, total)
  // One arc per thing, while each arc stays long enough to read; one ring after that.
  const segmented = n > 1 && n <= 8
  const gap = segmented ? stroke * 1.9 : 0
  const seg = segmented ? c / n - gap : c
  const lit = Math.max(0, Math.min(n, done))

  // Pour in after the first paint.
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(lit))
    return () => cancelAnimationFrame(frame)
  }, [lit])

  // Sparks only for a ring filled while they watched.
  const was = useRef(lit)
  const [burst, setBurst] = useState(0)
  useEffect(() => {
    if (lit === n && was.current < n) setBurst((b) => b + 1)
    was.current = lit
  }, [lit, n])

  const full = lit === n
  const arcs = segmented ? Array.from({ length: n }, (_, i) => i) : [0]
  return (
    <div
      role="img"
      aria-label={label}
      className="hub-charge-ring"
      data-full={full}
      data-fresh={burst > 0}
      style={{ width: size, height: size, ['--charge' as string]: lit / n, ['--ring-r' as string]: `${size / 2}px` } as CSSProperties}
    >
      <span aria-hidden className="hub-charge-halo" />
      {/* `overflow-visible`: the glow round each arc isn't cut off at the ring's own box. */}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="absolute inset-0 overflow-visible">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent-bright)" />
            <stop offset="100%" stopColor="var(--accent-deep)" />
          </linearGradient>
        </defs>
        {arcs.map((i) => {
          // From the top, clockwise, each arc centred in its slot.
          const turn = segmented ? (360 / n) * i - 90 + ((gap / 2) / c) * 360 : -90
          const on = segmented ? i < shown : true
          const length = segmented ? (on ? seg : 0) : (c * shown) / n
          return (
            <g key={i} transform={`rotate(${turn} ${size / 2} ${size / 2})`}>
              <circle className="hub-charge-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${seg} ${c - seg}`} />
              <circle
                className="hub-charge-lit"
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={`url(#${id})`}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${length} ${c}`}
                style={{ opacity: length > 0 ? 1 : 0, transitionDelay: `${segmented ? i * 60 : 0}ms` }}
              />
            </g>
          )
        })}
      </svg>
      {burst > 0 && (
        <span aria-hidden className="hub-burst" key={burst}>
          {Array.from({ length: SPARKS }, (_, i) => (
            <span key={i} style={{ ['--a' as string]: `${(360 / SPARKS) * i}deg`, ['--i' as string]: i } as CSSProperties} />
          ))}
        </span>
      )}
      <div className="relative flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}
