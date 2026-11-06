'use client'

import { Icon, type IconName } from '@/components/ui/Icon'
import { HUB_PREVIEW_COPY as C } from '@/lib/deals/copy'
import { TRAINER_COPY } from '@/lib/trainer/copy'
import type { HubPreviewInput } from './HubPreview'
import { YOU_PALETTE as P } from './you-palette'

/**
 * The member hub, before anything else in the box: a membership card that
 * says every order comes with it, for 90 days, and what's inside. The trainer
 * leads when there is one: a real person to ask is the thing nobody else in
 * the box can promise. Only what the founders have switched on is listed;
 * "See inside" jumps to the drawn hub further down.
 */
const DISPLAY = 'var(--font-display)'

export function HubCard({ input }: { input: HubPreviewInput }) {
  const perks: { icon: IconName; title: string; line: string; id: string }[] = [
    ...(input.training ? [{ id: 'training', icon: 'dumbbell' as const, title: C.cardTraining, line: C.cardTrainingLine }] : []),
    ...(input.deals && input.plan === 'oneoff' ? [{ id: 'deals', icon: 'star' as const, title: C.cardDeals, line: C.cardDealsLine }] : []),
    { id: 'guide', icon: 'sun', title: C.cardGuide, line: C.cardGuideLine },
    ...(input.checkIns ? [{ id: 'checkIns', icon: 'sparkle' as const, title: C.cardCheckIns, line: C.cardCheckInsLine }] : []),
  ]
  const t = input.trainer ?? null
  const hasPreview = Boolean(t || input.training || input.deals)

  return (
    <section
      aria-label={C.cardTitle}
      className="relative mb-6 overflow-hidden rounded-[28px] p-5 lg:p-6"
      style={{
        background: [
          'radial-gradient(90% 70% at 100% 0%, rgba(0,212,255,0.28), rgba(0,212,255,0) 60%)',
          'radial-gradient(70% 60% at 0% 100%, rgba(0,168,212,0.18), rgba(0,168,212,0) 60%)',
          P.night,
        ].join(', '),
        boxShadow: '0 28px 56px -28px rgba(10,15,20,0.85), inset 0 1px 0 rgba(255,255,255,0.1)',
      }}
      data-hub-card
    >
      {/* A fine grid, as on a card's face. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: P.accent, fontFamily: DISPLAY }}>
            <span aria-hidden className="inline-flex h-5 w-5 items-center justify-center rounded-md" style={{ background: P.accent, color: P.night }}>
              <Icon name="bolt" size={12} />
            </span>
            {C.cardEyebrow}
          </p>
          <h3 className="mt-2.5 text-[28px] font-black leading-[1.02] tracking-tight lg:text-[34px]" style={{ color: P.nightInk, fontFamily: DISPLAY }}>
            {C.cardTitle}
          </h3>
        </div>
        <span
          className="flex-shrink-0 rounded-2xl px-3 py-2 text-center"
          style={{ background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.45)', boxShadow: '0 0 20px rgba(0,212,255,0.25)' }}
        >
          <span className="block text-[22px] font-black leading-none" style={{ color: P.nightInk, fontFamily: DISPLAY }}>
            90
          </span>
          <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: P.accent, fontFamily: DISPLAY }}>
            {C.cardDays.replace(/^90 /, '')}
          </span>
        </span>
      </div>
      <p className="relative mt-2 max-w-xl text-[13px] leading-snug" style={{ color: P.nightInk2 }}>
        {C.cardSub}
      </p>

      {t && (
        <div
          className="relative mt-4 flex items-center gap-3 rounded-2xl p-3"
          style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.18), rgba(0,212,255,0.04))', border: '1px solid rgba(0,212,255,0.4)' }}
          data-hub-card-trainer
        >
          {t.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.photoUrl} alt="" width={44} height={44} className="h-11 w-11 flex-shrink-0 rounded-full object-cover" style={{ border: `2px solid ${P.accent}` }} />
          ) : (
            <span
              aria-hidden
              className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[18px] font-black"
              style={{ background: `linear-gradient(160deg, ${P.accentBright}, ${P.accent} 55%, ${P.accentDeep})`, color: P.night, fontFamily: DISPLAY }}
            >
              {t.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[16px] font-black leading-tight" style={{ color: P.nightInk, fontFamily: DISPLAY }}>
                {C.cardTrainer(t.name)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-black" style={{ background: 'rgba(61,220,151,0.16)', color: P.nightPositive, fontFamily: DISPLAY }}>
                <Icon name="check" size={10} />
                {TRAINER_COPY.revealBadge}
              </span>
            </span>
            <span className="mt-1 block text-[12.5px] leading-snug" style={{ color: P.nightInk2 }}>
              {C.cardTrainerLine}
            </span>
          </span>
        </div>
      )}

      <ul className="relative mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label={C.cardTitle}>
        {perks.map((p) => (
          <li key={p.id} className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} data-hub-card-perk={p.id}>
            <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: 'rgba(0,212,255,0.14)', color: P.accent }}>
              <Icon name={p.icon} size={14} />
            </span>
            <span className="mt-2 block text-[13px] font-bold leading-tight" style={{ color: P.nightInk, fontFamily: DISPLAY }}>
              {p.title}
            </span>
            <span className="mt-0.5 block text-[11.5px] leading-snug" style={{ color: P.nightInk3 }}>
              {p.line}
            </span>
          </li>
        ))}
      </ul>

      {hasPreview && (
        <a href="#hub-preview" className="relative mt-4 inline-flex items-center gap-1.5 text-[13px] font-bold underline-offset-4 hover:underline" style={{ color: P.accent, fontFamily: DISPLAY }} data-hub-card-more>
          {C.cardMore}
          <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
        </a>
      )}
    </section>
  )
}
