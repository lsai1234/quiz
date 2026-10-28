'use client'

import type { ReactNode } from 'react'
import { DAYLIGHT_SPAN, ENERGY_SPAN, arcPath, dayRingData, dayRingLines, dayRingText, pointAt } from '@/lib/consult/day-ring'
import type { ConsultAnswers } from '@/lib/consult/types'

/**
 * The day ring (plan Phase 7.3): Amp's ring as a 24-hour dial of their day,
 * midnight at the top. It fills in as they answer, and plots only what they've
 * told us (`day-ring.ts`). Each mark is a flight slot (`data-flight-slot`), so
 * an answer flies into its own place as the next scene arrives.
 *
 *   sm   round Amp in the consult, in the reticle's footprint
 *   lg   for the read (Phase 8): hour labels, and the ring in words beside it
 *
 * Marks fade in (`amp-anim-fade`, which animates opacity), so how strong a
 * mark is goes on its stroke-opacity, never its opacity.
 *
 * The words are the ring's text alternative: "Your day: sleep 23:30 to 06:00,
 * last coffee about 16:00…".
 */

const R = 44
const INNER = 36

const SWATCH = {
  sleep: 'var(--amp-calm)',
  caffeine: 'var(--amp-ink)',
  training: 'var(--amp-go)',
  daylight: 'var(--amp-sun)',
  energy: 'var(--amp-accent)',
} as const

export function DayRing({ answers, size = 'sm', children }: { answers: ConsultAnswers; size?: 'sm' | 'lg'; children?: ReactNode }) {
  const d = dayRingData(answers)
  const text = dayRingText(d)
  const lg = size === 'lg'
  const ring = (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      data-day-ring={size}
      style={{
        width: lg ? 'calc(var(--amp-space-10) * 5)' : 'calc(var(--amp-space-10) + var(--amp-space-2))',
        height: lg ? 'calc(var(--amp-space-10) * 5)' : 'calc(var(--amp-space-10) + var(--amp-space-2))',
      }}
    >
      <svg viewBox={lg ? '-8 -8 116 116' : '0 0 100 100'} role="img" aria-label={text} className="absolute inset-0 h-full w-full" style={{ overflow: 'visible' }}>
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--amp-edge-strong)" strokeWidth="2" />
        {/* The hours: 00 at the top, 06, 12, 18. */}
        {[0, 6, 12, 18].map((h) => {
          const a = pointAt(h * 60, R - 4)
          const b = pointAt(h * 60, R + 4)
          const label = pointAt(h * 60, R + 11)
          return (
            <g key={h}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--amp-ink-3)" strokeWidth={lg ? 1 : 2} strokeLinecap="round" />
              {lg && (
                <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="central" fill="var(--amp-ink-2)" style={{ fontFamily: 'var(--amp-font-label)', fontSize: '5px' }}>
                  {String(h).padStart(2, '0')}
                </text>
              )}
            </g>
          )
        })}
        {d.daylight && (
          <path data-flight-slot="daylight" className="amp-anim-fade" d={arcPath(DAYLIGHT_SPAN.from, DAYLIGHT_SPAN.to, R)} fill="none" stroke={SWATCH.daylight} strokeWidth="11" strokeLinecap="round" strokeOpacity={0.2 + d.daylight.level * 0.6} />
        )}
        {d.sleep && <path data-flight-slot="sleep" className="amp-anim-fade" d={arcPath(d.sleep.bed, d.sleep.wake, R)} fill="none" stroke={SWATCH.sleep} strokeWidth="6" strokeLinecap="round" />}
        {d.energy && (
          <path
            data-flight-slot="energy"
            className="amp-anim-fade"
            d={arcPath(ENERGY_SPAN.from, ENERGY_SPAN.to, INNER)}
            fill="none"
            stroke={SWATCH.energy}
            strokeWidth={2 + d.energy.level * 0.5}
            strokeLinecap="round"
            strokeOpacity={0.35 + d.energy.level * 0.065}
          />
        )}
        {d.caffeine &&
          ('at' in d.caffeine ? (
            <circle data-flight-slot="caffeine" className="amp-anim-fade" {...xy(pointAt(d.caffeine.at, R))} r="4" fill={SWATCH.caffeine} stroke="var(--amp-ground)" strokeWidth="1.5" />
          ) : (
            // No time to put it at: the count, as a tally under Amp.
            <g data-flight-slot="caffeine" className="amp-anim-fade">
              {Array.from({ length: Math.min(5, d.caffeine.count) }, (_, i) => (
                <circle key={i} cx={50 + (i - (Math.min(5, (d.caffeine as { count: number }).count) - 1) / 2) * 6} cy="84" r="2.2" fill={SWATCH.caffeine} />
              ))}
              {d.caffeine.count === 0 && <circle cx="50" cy="84" r="2.2" fill="none" stroke={SWATCH.caffeine} strokeWidth="1" />}
            </g>
          ))}
        {d.training &&
          ('at' in d.training ? (
            <path data-flight-slot="training" className="amp-anim-fade" d={diamond(pointAt(d.training.at, R))} fill={SWATCH.training} stroke="var(--amp-ground)" strokeWidth="1.5" />
          ) : (
            // No time: the week, as seven pips over Amp, the days they train filled.
            <g data-flight-slot="training" className="amp-anim-fade">
              {Array.from({ length: 7 }, (_, i) => (
                <circle key={i} cx={50 + (i - 3) * 5.5} cy="16" r="1.9" fill={i < (d.training as { days: number }).days ? SWATCH.training : 'var(--amp-edge-strong)'} />
              ))}
            </g>
          ))}
      </svg>
      {children}
    </span>
  )
  if (!lg) return ring
  const lines = dayRingLines(d)
  return (
    <figure className="flex flex-col items-center" style={{ gap: 'var(--amp-space-4)' }}>
      {ring}
      <figcaption>
        {lines.length ? (
          <ul className="flex flex-col" style={{ gap: 'var(--amp-space-1)' }} aria-label="Your day, in words">
            {lines.map((l) => (
              <li key={l.slot} className="flex items-center" style={{ gap: 'var(--amp-space-2)', fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>
                <span aria-hidden style={{ width: 'var(--amp-space-3)', height: 'var(--amp-space-3)', borderRadius: 'var(--amp-radius-pill)', background: SWATCH[l.slot] }} />
                {l.text.charAt(0).toUpperCase() + l.text.slice(1)}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>{text}</p>
        )}
      </figcaption>
    </figure>
  )
}

const xy = (p: { x: number; y: number }) => ({ cx: p.x, cy: p.y })
const diamond = ({ x, y }: { x: number; y: number }) => `M${x} ${y - 4.5}L${x + 4.5} ${y}L${x} ${y + 4.5}L${x - 4.5} ${y}Z`
