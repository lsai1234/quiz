import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { listOrders, listAwaitingFulfilment } from '@/lib/orders/repo'
import { buildFulfilmentQueue } from '@/lib/orders/queue'
import { listActiveSubscriptions } from '@/lib/db/hub-data'
import { listChanges } from '@/lib/changes/repo'
import { summarise } from '@/lib/changes/health'
import { OPEN_STATUSES } from '@/lib/changes/types'
import { quizFunnel } from '@/lib/analytics/funnel-cache'
import { buildDashboard } from '@/lib/portal/dashboard'
import { buildVatPosition } from '@/lib/pricing/vat-position'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { productReadiness } from '@/lib/portal/readiness'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'
import { syncPortalRuntime } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

/**
 * GET /api/portal/dashboard?days=30
 *
 * Everything the hub's front page shows, in one round trip: the money, what
 * needs a founder, the subscription book, and where the quiz is losing people.
 * Assembled here and aggregated by pure functions, so the arithmetic is tested
 * in `lib/portal/dashboard.ts` and `lib/analytics/funnel.ts` rather than in a
 * route nobody can call from a test.
 */
export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()

  const params = new URL(req.url).searchParams
  const days = Math.min(365, Math.max(1, Number(params.get('days')) || 30))

  const [orders, unfulfilled, subs, openChanges, funnel, catalogue] = await Promise.all([
    listOrders({ limit: 500 }),
    listAwaitingFulfilment(),
    listActiveSubscriptions(),
    listChanges({ status: OPEN_STATUSES }),
    // Cached for a few minutes — see `funnel-cache.ts` for why this one read is
    // worth treating differently from everything else on this page. `?fresh=1`
    // recomputes it for somebody who has just run the quiz to see it move.
    quizFunnel(days, { fresh: params.get('fresh') === '1' }),
    getResolvedCatalogue(),
  ])

  const byUser = new Map<string, typeof openChanges>()
  for (const e of openChanges) byUser.set(e.userId, [...(byUser.get(e.userId) ?? []), e])
  const subscriptions = subs.map(({ userId, subscription }) =>
    summarise(userId, subscription, byUser.get(userId) ?? []),
  )

  const queue = buildFulfilmentQueue(unfulfilled)
  const live = catalogue.source === 'real'
  const notReady = catalogue.products.filter((p) => productReadiness(p, { live }).overall !== 'ok').length
  const config = getPricingConfig()

  const costed = catalogue.products.filter((p) => p.cost != null && p.basePrice > 0)
  const vat = buildVatPosition({
    orders,
    config,
    averageCostRatio:
      costed.length > 0
        ? costed.reduce((s, p) => s + p.cost! / p.basePrice, 0) / costed.length
        : config.defaultCostRatio,
  })

  return NextResponse.json({
    windowDays: days,
    summary: buildDashboard({
      orders,
      subscriptions,
      config,
      awaitingReview: queue.pending,
      readyToSend: queue.readyToSend,
      undeliverable: queue.undeliverable,
      openChanges: openChanges.length,
      productsNeedingAttention: notReady,
      vat: vat.verdict,
    }),
    funnel: funnel.funnel,
    funnelAsOf: funnel.asOf,
  })
}
