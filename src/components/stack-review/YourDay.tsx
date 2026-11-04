'use client'

import { useId } from 'react'
import type { Routine } from '@/lib/routine'
import { ROUTINE_COPY } from '@/lib/routine/copy'
import { ringArc, ringPoint, spokenClock } from '@/lib/routine/ring'
import { YOU_PALETTE as P } from './you-palette'

/**
 * "Your day" (Option 3): the products switched on, placed on their own day.
 *
 * A small ring (midnight at the top, as the consult draws their day) with the
 * night shaded and a numbered dot at each moment; the list under it says the
 * same in words and is what a screen reader reads. It follows the switches, so
 * turning a product on puts it on their day straight away.
 */
const DISPLAY = 'var(--font-display)'
const R = 38

export function YourDay({ routine }: { routine: Routine }) {
  const headingId = useId()
  const { day, moments } = routine
  const timed = moments.filter((m) => m.minutes !== null)
  if (moments.length === 0) return null

  return (
    <section aria-labelledby={headingId} className="mt-5 rounded-2xl px-4 py-4" style={{ background: P.page }} data-your-day>
      <h4 id={headingId} className="text-[17px] font-black leading-tight tracking-tight" style={{ color: P.ink, fontFamily: DISPLAY }}>
        {ROUTINE_COPY.heading}
      </h4>
      <p className="mt-1 text-[13px] leading-snug" style={{ color: P.ink2 }}>
        {day.assumed ? ROUTINE_COPY.subAssumed : ROUTINE_COPY.sub}
      </p>

      <div className="mt-3 flex justify-center">
        <svg viewBox="0 0 100 100" width={168} height={168} aria-hidden data-day-ring>
          {/* The day, then the night over it. */}
          <circle cx={50} cy={50} r={R} fill="none" stroke="rgba(0,212,255,0.28)" strokeWidth={7} />
          <path d={ringArc(day.bed, day.wake, R)} fill="none" stroke="rgba(10,10,10,0.13)" strokeWidth={7} strokeLinecap="butt" />
          {[0, 6, 12, 18].map((h) => {
            const a = ringPoint(h * 60, R - 7.5)
            return <circle key={h} cx={a.x} cy={a.y} r={0.9} fill="rgba(10,10,10,0.35)" />
          })}
          <text x={50} y={46} textAnchor="middle" fontSize={7} fontWeight={800} fill={P.ink} style={{ fontFamily: DISPLAY }}>
            {spokenClock(day.wake)}
          </text>
          <text x={50} y={53.5} textAnchor="middle" fontSize={4.6} fill={P.ink3}>
            to
          </text>
          <text x={50} y={61} textAnchor="middle" fontSize={7} fontWeight={800} fill={P.ink} style={{ fontFamily: DISPLAY }}>
            {spokenClock(day.bed)}
          </text>
          {timed.map((m, i) => {
            const at = ringPoint(m.minutes!, R)
            return (
              <g key={`${m.minutes}-${m.label}`} style={{ transform: `translate(${at.x}px, ${at.y}px)`, transition: 'transform 0.4s cubic-bezier(0.2,0.8,0.2,1)' }}>
                <circle r={5.6} fill={P.accent} stroke={P.page} strokeWidth={1.4} />
                <text y={2} textAnchor="middle" fontSize={5.6} fontWeight={800} fill={P.ink} style={{ fontFamily: DISPLAY }}>
                  {i + 1}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <ol className="mt-2 space-y-3">
        {moments.map((m) => {
          const n = m.minutes === null ? null : timed.indexOf(m) + 1
          return (
            <li key={`${m.minutes}-${m.label}`} className="flex items-start gap-3" data-moment={m.label}>
              <span
                aria-hidden
                className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-black"
                style={{ background: n ? P.accent : 'transparent', border: n ? 'none' : `1.5px dashed rgba(10,10,10,0.3)`, color: P.ink, fontFamily: DISPLAY }}
              >
                {n ?? ''}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-snug" style={{ color: P.ink }}>
                  {m.minutes !== null && <span className="font-bold">{spokenClock(m.minutes)} · </span>}
                  <span className={m.minutes === null ? 'font-bold' : undefined}>{m.label}</span>
                </p>
                <ul className="mt-0.5">
                  {m.items.map((item) => (
                    <li key={item.productId} className="text-[13px] leading-snug" style={{ color: P.ink2 }}>
                      {item.title}
                      <span style={{ color: P.ink3 }}>
                        {' · '}
                        {[item.amount, item.days === 'every-day' ? null : item.daysLabel, m.minutes === null && item.moment !== m.label ? item.moment : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          )
        })}
      </ol>
      <p className="mt-3 text-[11.5px] leading-snug" style={{ color: P.ink3 }}>
        {ROUTINE_COPY.labelFirst}
      </p>
    </section>
  )
}
