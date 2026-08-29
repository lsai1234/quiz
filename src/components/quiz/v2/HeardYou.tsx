'use client'

import { useQuizStore } from '@/lib/store'
import { DRIVERS, rankedDrivers } from '@/lib/quiz-v2/drivers'
import { DRIVER_CHANGED } from '@/lib/quiz-core/driver-map'

/**
 * What we heard, and what it changed.
 *
 * The payoff for the whole redesign, and the answer to the requirement the
 * interview is really built around: not just that the questions adapted, but
 * that the person can *see* they went somewhere. Each line pairs what they told
 * us with what it did to the box — "you find it hard to switch off at night, so
 * we led with a wind-down blend rather than anything stimulating".
 *
 * ── Why here, of all places ─────────────────────────────────────────────────
 * Act 3 already waits several seconds while the stack is built and the identity
 * comes back. That wait was an animation with nothing to read. Putting the
 * recap in it costs zero added latency — it is the one moment in the flow with
 * time to spare and a captive, invested reader.
 *
 * ── The wording rule ────────────────────────────────────────────────────────
 * Both halves of every line are pre-written (`drivers.ts` and
 * `driver-map.ts`). Nothing here is generated, and nothing here is a claim
 * about health: the left half is an observation about someone's routine, the
 * right half is a statement about what we put in a box. A generated sentence in
 * this slot would be the easiest possible way to end up making a medical claim
 * on a supplement site.
 */

/** Three is the most that reads as insight. Four starts to read as a printout. */
const MAX_LINES = 3

export function HeardYou({ reducedMotion }: { reducedMotion: boolean }) {
  const drivers = useQuizStore((s) => s.answers.drivers)
  const lines = rankedDrivers(drivers ?? {}).slice(0, MAX_LINES)

  // v1 answers carry no drivers, and a v2 run that settled nothing has nothing
  // honest to say. Both render nothing rather than a hedge.
  if (lines.length === 0) return null

  return (
    <div
      className="mt-8 w-full max-w-sm mx-auto px-5"
      style={{ animation: reducedMotion ? undefined : 'fade-in 0.6s ease 0.8s both' }}
    >
      <p
        className="text-[10px] font-semibold tracking-[0.24em] uppercase text-[#00D4FF]/70 text-center mb-3"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        What you told us
      </p>
      <ul className="flex flex-col gap-2.5">
        {lines.map((d, i) => (
          <li
            key={d.id}
            className="flex items-start gap-2.5 text-[12.5px] leading-snug text-white/60"
            style={{
              animation: reducedMotion
                ? undefined
                : `slide-up-in 0.45s cubic-bezier(0.22,1,0.36,1) ${1 + i * 0.22}s both`,
            }}
          >
            <span
              className="shrink-0 mt-[3px] w-1.5 h-1.5 rounded-full bg-[#00D4FF]"
              style={{ boxShadow: '0 0 6px rgba(0,212,255,0.7)' }}
              aria-hidden="true"
            />
            <span>
              <span className="text-white/85">{DRIVERS[d.id].heard}</span>
              {' — '}
              {DRIVER_CHANGED[d.id]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
