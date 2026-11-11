/**
 * A member's deals, from what they've bought (server-only): their paid
 * orders in the last 90 days, by account or email; their plan's products left
 * out; their usage from the training answers their order carried.
 */
import type { UserRecord } from '@/lib/db/users'
import type { QuizAnswers } from '@/lib/types'
import { frequencyFor, HUB_DAYS, memberDeals, type MemberDeal, type Purchase } from './engine'

export interface DealsState {
  enabled: boolean
  deals: MemberDeal[]
  hubEndsOn: string | null
  /** A top-up box ships free at or over this (£). */
  freeOver: number
  /** 90 days of the hub at its price on its own, while it's on sale on its own; null to say no value. */
  hubValue: number | null
}

export async function dealsFor(user: Pick<UserRecord, 'id' | 'email'>, now = new Date()): Promise<DealsState> {
  const { getOfferSettings } = await import('@/lib/offer/store')
  const settings = await getOfferSettings()
  const enabled = settings.services.deals
  const { hubValue, effectiveTopUpFreeOver } = await import('@/lib/offer/settings')
  const { getPricingConfig } = await import('@/lib/stack-blueprint/pricing')
  const freeOver = effectiveTopUpFreeOver(settings.memberDeals, getPricingConfig().freeDeliveryThreshold)
  if (!enabled) return { enabled, deals: [], hubEndsOn: null, freeOver, hubValue: hubValue(settings) }

  const { listPaidOrdersFor } = await import('@/lib/orders/repo')
  const since = new Date(now.getTime() - HUB_DAYS * 86_400_000).toISOString()
  const orders = await listPaidOrdersFor({ userId: user.id, email: user.email }, since)
  const purchases: Purchase[] = orders.flatMap((o) =>
    o.lines.map((l) => ({ productId: l.productId, variantTitle: l.variantTitle ?? null, quantity: l.quantity, at: o.createdAt, bonus: l.bonus === true })),
  )

  const { getSubscription, getQuiz } = await import('@/lib/db/hub-data')
  const sub = await getSubscription(user.id)
  const planProductIds = sub && sub.status !== 'cancelled' ? sub.lines.map((l) => l.productId) : []
  const saved = sub ? ((await getQuiz<{ answers?: Partial<QuizAnswers> }>(user.id))?.answers ?? null) : null
  const seedDays = orders.find((o) => o.guideSeed?.day)?.guideSeed?.day.trainDays ?? null
  const answers: Partial<QuizAnswers> | null = saved ?? (seedDays ? { trainingFrequency: frequencyFor(seedDays) } : null)

  const { getResolvedCatalogue } = await import('@/lib/catalogue/resolve')
  const { products } = await getResolvedCatalogue()
  const { deals, hubEndsOn } = memberDeals({ purchases, products, answers, planProductIds, now, sizes: settings.memberDeals })
  return { enabled, deals, hubEndsOn, freeOver, hubValue: hubValue(settings) }
}
