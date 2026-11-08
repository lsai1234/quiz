'use client'

import Link from 'next/link'
import { useEffect, useId, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { DEALS_COPY, HUB_PREVIEW_COPY as C } from '@/lib/deals/copy'
import type { HubPreview as Preview } from '@/lib/hub-preview/build'
import type { PublicTrainer } from '@/lib/trainer/types'
import { TRAINER_COPY } from '@/lib/trainer/copy'
import { YOU_PALETTE as P } from './you-palette'

/**
 * "Your hub, for 90 days": what the order opens, shown rather than told. The
 * first training week their answers would build, and the member price each
 * product in the box would get, from `/api/hub-preview` (rules only, the same
 * answers the order carries). Only what the founders have switched on;
 * nothing at all when neither is.
 *
 * It is drawn as the hub's own dark screen on the light panel, so what they
 * see here is what they open after the order. The conditions and the terms
 * sit under it, on the panel.
 */
const DISPLAY = 'var(--font-display)'
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const MEMBER_HUB_TERMS_PATH = '/legal/member-hub'
const gbp = (n: number) => `£${n.toFixed(2)}`

export interface HubPreviewInput {
  productIds: string[]
  plan: 'oneoff' | 'subscription'
  /** The guide seed the checkout will send: their day, goals and training answers. */
  guide: unknown
  training: boolean
  deals: boolean
  /** Amp's check-ins are on. */
  checkIns?: boolean
  /** Ask your trainer, when it's live: who members will be asking. */
  trainer?: PublicTrainer | null
  /** The hub's price a month on its own, while it's on sale on its own; null to show no value. */
  hubMonthly?: number | null
}

export function HubPreview({ input }: { input: HubPreviewInput }) {
  const headingId = useId()
  const [preview, setPreview] = useState<Preview | null>(null)
  const key = JSON.stringify([input.productIds, input.plan, input.guide, input.training, input.deals])

  useEffect(() => {
    if (!input.training && !input.deals) return
    if (typeof fetch !== 'function') return
    const controller = new AbortController()
    // Toggling products quickly asks once, after the last change.
    const t = window.setTimeout(() => {
      fetch('/api/hub-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: input.productIds, plan: input.plan, guide: input.guide }),
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((p: Preview | null) => setPreview(p))
        .catch(() => {})
    }, 350)
    return () => {
      window.clearTimeout(t)
      controller.abort()
    }
    // `key` stands for every input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const training = input.training ? preview?.training : null
  const deals = input.deals && input.plan === 'oneoff' ? preview?.deals : null
  const trainer = input.trainer ?? null
  if (!trainer && !training && !deals && !(input.deals && input.plan === 'subscription')) return null

  return (
    <section aria-labelledby={headingId} className="mt-6 scroll-mt-28" id="hub-preview" data-hub-preview>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: P.accentInk, fontFamily: DISPLAY }}>
        {C.eyebrow}
      </p>
      <h4 id={headingId} className="mt-1 text-[22px] font-black leading-[1.05] tracking-tight" style={{ color: P.ink, fontFamily: DISPLAY }}>
        {C.heading}
      </h4>
      <p className="mt-1.5 text-[13px] leading-snug" style={{ color: P.ink2 }}>
        {C.sub}
      </p>

      {(trainer || training || deals) && (
        <div
          className="relative mt-4 overflow-hidden rounded-[26px] p-3"
          style={{
            background: `radial-gradient(120% 60% at 85% 0%, rgba(0,212,255,0.20), rgba(0,212,255,0) 60%), ${P.night}`,
            boxShadow: '0 24px 48px -24px rgba(10,15,20,0.75), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
          data-hub-screen
        >
          {/* The screen's own header: whose hub, and its 90 days as a ring. */}
          <div className="flex items-center justify-between gap-3 px-1.5 pb-2.5 pt-1">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: P.nightInk2, fontFamily: DISPLAY }}>
              <span aria-hidden className="inline-flex h-5 w-5 items-center justify-center rounded-md" style={{ background: P.accent, color: P.night }}>
                <Icon name="bolt" size={12} />
              </span>
              {C.screenTitle}
            </p>
            <DaysRing />
          </div>

          {trainer && <TrainerPreview trainer={trainer} />}

          {training && (
            <div className={`${trainer ? 'mt-2.5 ' : ''}rounded-[18px] px-3.5 py-3`} style={{ background: P.nightCard, border: '1px solid rgba(255,255,255,0.07)' }} data-hub-preview-training>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: P.accent, fontFamily: DISPLAY }}>
                  {C.trainingTitle}
                </p>
                <p className="text-[11.5px] font-semibold" style={{ color: P.nightInk3 }}>
                  {C.sessionsCount(training.sessions.length)}
                </p>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-snug" style={{ color: P.nightInk2 }}>
                {C.trainingBody}
              </p>
              {trainer?.checksPlans && (
                <p className="mt-2 flex items-start gap-1.5 text-[12.5px] font-semibold leading-snug" style={{ color: P.nightInk }} data-hub-preview-checked>
                  <span aria-hidden className="mt-px" style={{ color: P.nightPositive }}>
                    <Icon name="check" size={12} />
                  </span>
                  {TRAINER_COPY.revealChecked(trainer.name)}
                </p>
              )}

              {/* The week at a glance: a block on each day with a session. The list says it in words. */}
              <div className="mt-3 grid grid-cols-7 gap-1.5" aria-hidden>
                {DAYS.map((d, i) => {
                  const on = training.sessions.find((s) => s.day === i)
                  return (
                    <div key={d} className="flex flex-col items-center gap-1">
                      <span className="text-[10px] font-bold" style={{ color: on ? P.nightInk : P.nightInk3, fontFamily: DISPLAY }}>
                        {d.charAt(0)}
                      </span>
                      <span
                        className="flex h-8 w-full items-center justify-center rounded-lg"
                        style={
                          on?.kind === 'strength'
                            ? {
                                background: `linear-gradient(160deg, ${P.accentBright}, ${P.accent} 55%, ${P.accentDeep})`,
                                color: P.night,
                                boxShadow: '0 6px 14px -8px rgba(0,212,255,0.9)',
                              }
                            : on
                              ? { border: `1.5px solid ${P.accent}`, color: P.accent }
                              : { background: 'rgba(255,255,255,0.05)' }
                        }
                      >
                        {on && <Icon name={on.kind === 'strength' ? 'dumbbell' : 'activity'} size={13} />}
                      </span>
                    </div>
                  )
                })}
              </div>

              <ol className="mt-3 space-y-2">
                {training.sessions.map((s) => (
                  <li key={`${s.day}-${s.title}`} className="flex items-start gap-2.5">
                    <span className="mt-px w-9 flex-shrink-0 text-[12px] font-bold" style={{ color: P.accent, fontFamily: DISPLAY }}>
                      {DAYS[s.day]}
                    </span>
                    <span className="min-w-0 flex-1 text-[13px] leading-snug">
                      <span className="font-semibold" style={{ color: P.nightInk }}>
                        {s.title}
                      </span>
                      <span style={{ color: P.nightInk3 }}>{` · ${s.minutes} min`}</span>
                      {s.moves.length > 0 && (
                        <span className="block text-[12px]" style={{ color: P.nightInk3 }}>
                          {s.moves.join(', ')}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {deals && (
            <div
              className={`${training || trainer ? 'mt-2.5' : ''} rounded-[18px] px-3.5 py-3`}
              style={{ background: P.nightCard, border: '1px solid rgba(255,255,255,0.07)' }}
              data-hub-preview-deals
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: P.accent, fontFamily: DISPLAY }}>
                {C.dealsTitle}
              </p>
              <p className="mt-1.5 text-[12.5px] leading-snug" style={{ color: P.nightInk2 }}>
                {C.dealsBody}
              </p>
              <ul className="mt-2.5 space-y-2">
                {deals.slice(0, 5).map((d) => (
                  <li
                    key={d.productId}
                    className="flex items-start justify-between gap-3 rounded-xl px-3 py-2.5"
                    style={{ background: 'rgba(255,255,255,0.04)' }}
                    data-hub-preview-deal={d.productId}
                  >
                    <span className="min-w-0 text-[13px] leading-snug">
                      <span className="block font-semibold" style={{ color: P.nightInk }}>
                        {d.short}
                      </span>
                      <span className="block text-[12px]" style={{ color: P.nightInk2 }}>
                        {d.line}
                      </span>
                      <span className="mt-0.5 block text-[11.5px]" style={{ color: P.nightInk3 }}>
                        {C.fromWeek(d.weeks)}
                      </span>
                    </span>
                    <span className="flex-shrink-0 text-right">
                      <span className="block text-[15px] font-black tabular-nums" style={{ color: P.accent, fontFamily: DISPLAY }}>
                        {gbp(d.total)}
                      </span>
                      <span className="block text-[11.5px] tabular-nums" style={{ color: P.nightInk3 }}>
                        <span className="sr-only">{`${C.insteadOf} `}</span>
                        <s>{gbp(d.normal)}</s>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-2.5 space-y-1 px-1">
        {training && (
          <p className="text-[12px] leading-snug" style={{ color: P.ink3 }}>
            {C.trainingMore}
          </p>
        )}
        {deals?.some((d) => d.free) && (
          <p className="text-[12px] leading-snug" style={{ color: P.ink3 }}>
            {DEALS_COPY.freeDeliveryCondition}
          </p>
        )}
        {input.deals && input.plan === 'subscription' && (
          <p className="text-[12.5px] leading-snug" style={{ color: P.ink2 }}>
            {C.dealsMonthly}
          </p>
        )}
        <p className="text-[12px] leading-snug">
          <Link href={MEMBER_HUB_TERMS_PATH} className="font-semibold underline underline-offset-2" style={{ color: P.ink2 }} data-hub-terms>
            {DEALS_COPY.termsLink}
          </Link>
        </p>
      </div>
    </section>
  )
}

/** The hub's 90 days, as the hub draws them: a full ring with the count in it. */
function DaysRing() {
  return (
    <span className="relative inline-flex h-10 w-10 items-center justify-center" role="img" aria-label={C.screenDays}>
      <svg aria-hidden width={40} height={40} viewBox="0 0 40 40" className="absolute inset-0" style={{ filter: 'drop-shadow(0 0 4px rgba(0,212,255,0.6))' }}>
        <circle cx={20} cy={20} r={16.5} fill="none" stroke={P.accent} strokeWidth={3.5} />
      </svg>
      <span aria-hidden className="relative text-[12px] font-black leading-none" style={{ color: P.nightInk, fontFamily: DISPLAY }}>
        90
      </span>
    </span>
  )
}

/**
 * Ask your trainer, on the drawn hub: who answers, that they're a real
 * person, and what to ask. No made-up conversation: their name, their line,
 * and the promise, as the hub itself shows it.
 */
function TrainerPreview({ trainer }: { trainer: PublicTrainer }) {
  return (
    <div
      className="relative overflow-hidden rounded-[18px] px-3.5 py-3.5"
      style={{ background: `linear-gradient(135deg, rgba(0,212,255,0.16), rgba(0,212,255,0.02) 60%), ${P.nightCard}`, border: '1px solid rgba(0,212,255,0.35)' }}
      data-hub-preview-trainer
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: P.accent, fontFamily: DISPLAY }}>
          {TRAINER_COPY.revealEyebrow}
        </p>
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-black" style={{ background: 'rgba(61,220,151,0.16)', color: P.nightPositive, fontFamily: DISPLAY }}>
          <Icon name="check" size={10} />
          {TRAINER_COPY.revealBadge}
        </span>
      </div>
      <div className="mt-2.5 flex items-center gap-3">
        {trainer.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={trainer.photoUrl} alt="" width={48} height={48} className="h-12 w-12 flex-shrink-0 rounded-full object-cover" style={{ border: `2px solid ${P.accent}` }} />
        ) : (
          <span
            aria-hidden
            className="inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-[19px] font-black"
            style={{ background: `linear-gradient(160deg, ${P.accentBright}, ${P.accent} 55%, ${P.accentDeep})`, color: P.night, fontFamily: DISPLAY, boxShadow: '0 0 16px rgba(0,212,255,0.55)' }}
          >
            {trainer.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-[16px] font-black leading-tight" style={{ color: P.nightInk, fontFamily: DISPLAY }}>
            {TRAINER_COPY.revealTitle(trainer.name)}
          </span>
          <span className="mt-0.5 block text-[12px]" style={{ color: P.nightInk3 }}>
            {`${trainer.role} · ${TRAINER_COPY.replyWithin(trainer.replyHours)}`}
          </span>
        </span>
      </div>
      <p className="mt-2.5 text-[12.5px] leading-snug" style={{ color: P.nightInk2 }}>
        {TRAINER_COPY.revealBody(trainer.name)}
      </p>
      <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: P.nightInk }}>
        <span aria-hidden style={{ color: P.accent }}>
          <Icon name="play" size={11} />
        </span>
        {TRAINER_COPY.revealVideo}
      </p>
      {/* What asking looks like: a question box, empty, as in the hub. */}
      <div className="mt-3 flex items-center justify-between gap-2 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} aria-hidden>
        <span className="text-[12.5px]" style={{ color: P.nightInk3 }}>
          {TRAINER_COPY.placeholder}
        </span>
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full" style={{ background: P.accent, color: P.night }}>
          <Icon name="send" size={13} />
        </span>
      </div>
    </div>
  )
}
