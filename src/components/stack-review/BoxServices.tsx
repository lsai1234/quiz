'use client'

import Link from 'next/link'
import { useId } from 'react'
import type { ChargeView } from '@/lib/offer/levels'
import { LEVEL_COPY } from '@/lib/offer/levels-copy'
import { YOU_PALETTE as P } from './you-palette'

/**
 * "Your box comes with" (Option 1, levels that unlock a service): what this box
 * gets beyond its products, and, when a bigger box adds something, the charge
 * level it is at and how far the next one is. Services that are switched off in
 * the Founders Hub never appear; the guarantee carries its conditions and terms
 * beside it, as "free" does.
 */
const DISPLAY = 'var(--font-display)'
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

export const GUARANTEE_TERMS_PATH = '/legal/guarantee'

export function BoxServices({ view }: { view: ChargeView }) {
  const headingId = useId()
  const current = view.levels.find((l) => l.id === view.level)
  const reachedCount = view.levels.filter((l) => l.reached).length
  return (
    <section aria-labelledby={headingId} className="mt-5 rounded-2xl px-4 py-4" style={{ background: P.page }} data-box-services data-level={view.level}>
      <div className="flex items-center justify-between gap-3">
        <h4 id={headingId} className="text-[17px] font-black leading-tight tracking-tight" style={{ color: P.ink, fontFamily: DISPLAY }}>
          {LEVEL_COPY.heading}
        </h4>
        {current && (
          <span className="rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: P.accent, color: P.ink, fontFamily: DISPLAY }} data-charge-level aria-live="polite">
            {current.name}
          </span>
        )}
      </div>

      {view.levels.length > 1 && (
        <div className="mt-3">
          <div className="flex gap-1.5" aria-hidden>
            {view.levels.map((l) => (
              <span
                key={l.id}
                className="h-2 flex-1 rounded-full"
                style={{ background: l.reached ? P.accent : 'rgba(10,10,10,0.1)', transition: `background-color 0.35s ${EASE}` }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between gap-1.5">
            {view.levels.map((l) => (
              <span key={l.id} className="flex-1 text-[11px] font-semibold" style={{ color: l.reached ? P.ink : P.ink3 }}>
                {l.name}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[13.5px] font-semibold leading-snug" style={{ color: P.ink }} data-next-level>
            {view.next ? LEVEL_COPY.nextLevel(view.next.more, view.next.name) : LEVEL_COPY.topLevel}
          </p>
          <span className="sr-only">{`${reachedCount} of ${view.levels.length}`}</span>
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {view.services.map((s) => (
          <li key={`${s.id}-${s.level}`} className="flex items-start gap-2.5" data-service={s.id} data-unlocked={s.unlocked}>
            <Mark on={s.unlocked} />
            <span className="min-w-0 flex-1 text-[13.5px] leading-snug" style={{ color: s.unlocked ? P.ink : P.ink3 }}>
              {s.label}
              {!s.unlocked && <span className="font-semibold">{` · ${LEVEL_COPY.at(LEVEL_COPY.level[s.level])}`}</span>}
              {s.id === 'guarantee' && (
                <span className="mt-0.5 block text-[11.5px]" style={{ color: P.ink3 }}>
                  {LEVEL_COPY.guaranteeConditions}{' '}
                  <Link href={GUARANTEE_TERMS_PATH} className="font-semibold underline underline-offset-2" style={{ color: P.ink2 }}>
                    {LEVEL_COPY.guaranteeTerms}
                  </Link>
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Mark({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className="mt-0.5 inline-flex flex-shrink-0 items-center justify-center rounded-full"
      style={{ width: 18, height: 18, background: on ? P.accent : 'transparent', border: on ? 'none' : '1.5px solid rgba(10,10,10,0.25)', color: P.ink }}
    >
      {on ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
        </svg>
      ) : (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(10,10,10,0.45)" strokeWidth="3" strokeLinecap="round">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      )}
    </span>
  )
}
