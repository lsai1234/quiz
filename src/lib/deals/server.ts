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
}

export async function dealsFor(user: Pick<UserRecord, 'id' | 'email'>, now = new Date()): Promise<DealsState> {
  const { getOfferSettings } = await import('@/lib/offer/store')
  const enabled = (await getOfferSettings()).services.deals
  if (!enabled) return { enabled, deals: [], hubEndsOn: null }

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
  const { deals, hubEndsOn } = memberDeals({ purchases, products, answers, planProductIds, now })
  return { enabled, deals, hubEndsOn }
}
