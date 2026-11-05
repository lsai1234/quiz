'use client'

import { useEffect, useId, useState } from 'react'
import { DEALS_COPY, HUB_PREVIEW_COPY as C } from '@/lib/deals/copy'
import type { HubPreview as Preview } from '@/lib/hub-preview/build'
import { YOU_PALETTE as P } from './you-palette'

/**
 * "Your hub, for 90 days": what the order opens, shown rather than told. The
 * first training week their answers would build, and the member price each
 * product in the box would get, from `/api/hub-preview` (rules only, the same
 * answers the order carries). Only what the founders have switched on;
 * nothing at all when neither is.
 */
const DISPLAY = 'var(--font-display)'
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export interface HubPreviewInput {
  productIds: string[]
  plan: 'oneoff' | 'subscription'
  /** The guide seed the checkout will send: their day, goals and training answers. */
  guide: unknown
  training: boolean
  deals: boolean
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
  if (!training && !deals && !(input.deals && input.plan === 'subscription')) return null

  return (
    <section aria-labelledby={headingId} className="mt-5 rounded-2xl px-4 py-4" style={{ background: P.page }} data-hub-preview>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: P.accentInk, fontFamily: DISPLAY }}>
        {C.eyebrow}
      </p>
      <h4 id={headingId} className="mt-1 text-[17px] font-black leading-tight tracking-tight" style={{ color: P.ink, fontFamily: DISPLAY }}>
        {C.heading}
      </h4>
      <p className="mt-1.5 text-[13px] leading-snug" style={{ color: P.ink2 }}>
        {C.sub}
      </p>

      {training && (
        <div className="mt-4 rounded-xl px-3.5 py-3" style={{ background: P.card }} data-hub-preview-training>
          <p className="text-[14.5px] font-bold" style={{ color: P.ink, fontFamily: DISPLAY }}>
            {C.trainingTitle}
          </p>
          <p className="mt-1 text-[12.5px] leading-snug" style={{ color: P.ink2 }}>
            {C.trainingBody}
          </p>
          <ol className="mt-2.5 space-y-1.5">
            {training.sessions.map((s) => (
              <li key={`${s.day}-${s.title}`} className="flex items-baseline gap-2.5 text-[13px] leading-snug">
                <span className="w-9 flex-shrink-0 font-bold" style={{ color: P.accentInk, fontFamily: DISPLAY }}>
                  {DAYS[s.day]}
                </span>
                <span className="min-w-0 flex-1" style={{ color: P.ink }}>
                  <span className="font-semibold">{s.title}</span>
                  <span style={{ color: P.ink3 }}>{` · ${s.minutes} min`}</span>
                  {s.moves.length > 0 && (
                    <span className="block text-[12px]" style={{ color: P.ink3 }}>
                      {s.moves.join(', ')}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-2.5 text-[12px] leading-snug" style={{ color: P.ink3 }}>
            {C.trainingMore}
          </p>
        </div>
      )}

      {deals && (
        <div className="mt-3 rounded-xl px-3.5 py-3" style={{ background: P.card }} data-hub-preview-deals>
          <p className="text-[14.5px] font-bold" style={{ color: P.ink, fontFamily: DISPLAY }}>
            {C.dealsTitle}
          </p>
          <p className="mt-1 text-[12.5px] leading-snug" style={{ color: P.ink2 }}>
            {C.dealsBody}
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {deals.slice(0, 5).map((d) => (
              <li key={d.productId} className="text-[13px] leading-snug" style={{ color: P.ink }} data-hub-preview-deal={d.productId}>
                {C.dealRow(d.short, d.line, d.total, d.normal, d.weeks)}
              </li>
            ))}
          </ul>
          {deals.some((d) => d.free) && (
            <p className="mt-2 text-[11.5px] leading-snug" style={{ color: P.ink3 }}>
              {DEALS_COPY.freeDeliveryCondition}
            </p>
          )}
        </div>
      )}

      {input.deals && input.plan === 'subscription' && (
        <p className="mt-3 text-[12.5px] leading-snug" style={{ color: P.ink2 }}>
          {C.dealsMonthly}
        </p>
      )}
    </section>
  )
}
