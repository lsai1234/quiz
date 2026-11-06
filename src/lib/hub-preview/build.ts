/**
 * The hub's preview on the results page: what their first week of training
 * could look like, and the member price each product in their box would get.
 * Built by the rules (no AI) from the same answers the order will carry, so
 * the plan they get matches what they were shown. Prices only, never costs.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { Goal, QuizAnswers } from '@/lib/types'
import type { RoutineDay } from '@/lib/routine'
import { dealPreview, frequencyFor } from '@/lib/deals/engine'
import type { MemberDealSettings } from '@/lib/offer/settings'
import { DEALS_COPY } from '@/lib/deals/copy'
import { buildWeek } from '@/lib/training/generate'
import { prefillPrefs, type TrainingSeed } from '@/lib/training/prefs'
import { sessionLength, sessionTitle } from '@/lib/training/view'
import { exerciseById } from '@/lib/training/library'
import type { Weekday } from '@/lib/training/types'

export interface HubPreview {
  training: { sessions: { day: Weekday; title: string; minutes: number; kind: 'strength' | 'activity'; moves: string[] }[] } | null
  deals: { productId: string; short: string; line: string; total: number; normal: number; weeks: number; free: boolean }[] | null
}

export function trainingPreview(input: { day: RoutineDay | null; goals: Goal[]; training: TrainingSeed | null }): HubPreview['training'] {
  const draft = prefillPrefs(input)
  // Gaps the setup would ask about: a gym and some experience, for the picture.
  const prefs = { ...draft, equipment: draft.equipment ?? 'gym', experience: draft.experience ?? 'some' } as const
  const sessions = buildWeek({ ...prefs }, 0).map((s) => ({
    day: s.day,
    title: sessionTitle(s),
    minutes: sessionLength(s),
    kind: s.type,
    moves: s.type === 'strength' ? s.exercises.slice(0, 3).map((p) => exerciseById(p.id)?.name ?? '').filter(Boolean) : [],
  }))
  return sessions.length ? { sessions } : null
}

export function dealsPreview(products: readonly CatalogueProduct[], trainDays: number | null, sizes?: MemberDealSettings): HubPreview['deals'] {
  const answers: Partial<QuizAnswers> | null = trainDays ? { trainingFrequency: frequencyFor(trainDays) } : null
  const out = products
    .map((p) => dealPreview(p, answers, undefined, sizes))
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .map((d) => ({
      productId: d.productId,
      short: d.short,
      line: DEALS_COPY.dealLine(d.quote),
      total: d.quote.total,
      normal: d.quote.normalTotal,
      weeks: d.weeks,
      free: d.quote.deliveryDeal === 'free',
    }))
  return out.length ? out : null
}
