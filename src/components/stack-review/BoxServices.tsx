'use client'

import Link from 'next/link'
import { useId } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'
import type { ChargeView } from '@/lib/offer/levels'
import { LEVEL_COPY } from '@/lib/offer/levels-copy'
import { YOU_PALETTE as P } from './you-palette'

/**
 * "Your box comes with" (Option 1, levels that unlock a service): what this box
 * gets beyond its products, and, when a bigger box adds something, the charge
 * level it is at and how far the next one is. Services that are switched off in
 * the Founders Hub never appear; the guarantee carries its conditions and terms
 * beside it, as "free" does.
 *
 * Each service is a row with its own mark, its name and a line under it; one
 * still to unlock is dimmed with a lock and the level that opens it.
 */
const DISPLAY = 'var(--font-display)'
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

export const GUARANTEE_TERMS_PATH = '/legal/guarantee'

const MARK: Record<string, IconName> = {
  guide: 'sun',
  reminders: 'bell',
  trainer: 'chat',
  training: 'dumbbell',
  deals: 'star',
  checkIns: 'sparkle',
  swaps: 'swap',
  guarantee: 'shield',
  rate: 'refresh',
}

type Titled = keyof typeof LEVEL_COPY.title

export function BoxServices({ view }: { view: ChargeView }) {
  const headingId = useId()
  const current = view.levels.find((l) => l.id === view.level)
  const reachedCount = view.levels.filter((l) => l.reached).length
  return (
    <section
      aria-labelledby={headingId}
      className="mt-5 rounded-[22px] px-4 py-4"
      style={{ background: P.page, border: `1px solid ${P.hairline}` }}
      data-box-services
      data-level={view.level}
    >
      <div className="flex items-center justify-between gap-3">
        <h4 id={headingId} className="text-[17px] font-black leading-tight tracking-tight" style={{ color: P.ink, fontFamily: DISPLAY }}>
          {LEVEL_COPY.heading}
        </h4>
        {current && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: P.ink, color: P.card, fontFamily: DISPLAY }}>
            <span aria-hidden style={{ color: P.accent }}>
              <Icon name="bolt" size={12} />
            </span>
            <span data-charge-level aria-live="polite">
              {current.name}
            </span>
          </span>
        )}
      </div>

      {view.levels.length > 1 && (
        <div className="mt-3.5">
          <div className="flex gap-1.5" aria-hidden>
            {view.levels.map((l) => (
              <span
                key={l.id}
                className="h-1.5 flex-1 rounded-full"
                style={{
                  background: l.reached ? `linear-gradient(90deg, ${P.accent}, ${P.accentBright})` : 'rgba(10,10,10,0.09)',
                  boxShadow: l.reached ? '0 0 10px rgba(0,212,255,0.45)' : 'none',
                  transition: `background-color 0.35s ${EASE}, box-shadow 0.35s ${EASE}`,
                }}
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
          <p className="mt-2 text-[13px] font-semibold leading-snug" style={{ color: P.ink2 }} data-next-level>
            {view.next ? LEVEL_COPY.nextLevel(view.next.more, view.next.name) : LEVEL_COPY.topLevel}
          </p>
          <span className="sr-only">{`${reachedCount} of ${view.levels.length}`}</span>
        </div>
      )}

      <ul className="mt-3.5 space-y-2">
        {view.services.map((s) => {
          const titled = s.id in LEVEL_COPY.title ? (s.id as Titled) : null
          return (
            <li
              key={`${s.id}-${s.level}`}
              className="flex items-start gap-3 rounded-2xl px-3 py-2.5"
              style={{ background: s.unlocked ? P.card : 'transparent', border: `1px ${s.unlocked ? 'solid' : 'dashed'} ${s.unlocked ? P.hairline : 'rgba(10,10,10,0.14)'}` }}
              data-service={s.id}
              data-unlocked={s.unlocked}
            >
              <Mark icon={MARK[s.id] ?? 'check'} on={s.unlocked} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold leading-snug" style={{ color: s.unlocked ? P.ink : P.ink3, fontFamily: DISPLAY }}>
                  {titled ? LEVEL_COPY.title[titled] : s.label}
                  {!s.unlocked && (
                    <span className="ml-1.5 inline-block rounded-full px-2 py-0.5 align-middle text-[11px] font-bold" style={{ background: 'rgba(10,10,10,0.06)', color: P.ink2 }}>
                      {LEVEL_COPY.at(LEVEL_COPY.level[s.level])}
                    </span>
                  )}
                </span>
                {titled && (
                  <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: s.unlocked ? P.ink2 : P.ink3 }}>
                    {LEVEL_COPY.line[titled]}
                  </span>
                )}
                {s.id === 'guarantee' && (
                  <span className="mt-1 block text-[11.5px] leading-snug" style={{ color: P.ink3 }}>
                    {LEVEL_COPY.guaranteeConditions}{' '}
                    <Link href={GUARANTEE_TERMS_PATH} className="font-semibold underline underline-offset-2" style={{ color: P.ink2 }}>
                      {LEVEL_COPY.guaranteeTerms}
                    </Link>
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The service's mark: its glyph on cyan once unlocked, a lock until then. */
function Mark({ icon, on }: { icon: IconName; on: boolean }) {
  return (
    <span
      aria-hidden
      className="mt-0.5 inline-flex flex-shrink-0 items-center justify-center rounded-xl"
      style={{
        width: 32,
        height: 32,
        background: on ? `linear-gradient(160deg, ${P.accentBright}, ${P.accent} 55%, ${P.accentDeep})` : 'rgba(10,10,10,0.05)',
        boxShadow: on ? '0 6px 14px -8px rgba(0,168,212,0.9), inset 0 1px 0 rgba(255,255,255,0.5)' : 'none',
        color: on ? P.ink : P.ink3,
      }}
    >
      <Icon name={on ? icon : 'lock'} size={15} />
    </span>
  )
}
