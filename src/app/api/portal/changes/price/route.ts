import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { syncPortalRuntime } from '@/lib/portal/store'
import { listChanges } from '@/lib/changes/repo'
import { absorbPriceChange, isUndecided, schedulePassOn } from '@/lib/changes/service'
import { minimumPassOnPct, summarisePriceGroup } from '@/lib/changes/price'
import { getSubscription } from '@/lib/db/hub-data'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'
import { OPEN_STATUSES, PRICE_KINDS } from '@/lib/changes/types'
import type { MemberSubscription } from '@/lib/recharge/types'

export const dynamic = 'force-dynamic'

/**
 * Supplier price moves, grouped by product.
 *
 * GET  — both sides of the decision for every affected product: what the margin
 *        becomes if we swallow it, what each member's monthly becomes if we
 *        don't, and the smallest pass-on that keeps the line above the floor.
 *        `?passOnPct=` re-runs the per-member figures at a different share.
 * POST — `{ productId, action: 'absorb' | 'pass-on', passOnPct? }`.
 */
export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()

  const url = new URL(req.url)
  const passOnPct = Number(url.searchParams.get('passOnPct') ?? '1')
  const config = getPricingConfig()

  const events = (await listChanges({ status: OPEN_STATUSES, kind: PRICE_KINDS })).filter(
    (e) => e.price && isUndecided(e),
  )
  if (events.length === 0) return NextResponse.json({ count: 0, groups: [] })

  const { products } = await getResolvedCatalogue()
  const subscriptions = new Map<string, MemberSubscription>()
  for (const event of events) {
    if (subscriptions.has(event.userId)) continue
    const sub = await getSubscription(event.userId)
    if (sub) subscriptions.set(event.userId, sub)
  }

  const byProduct = new Map<string, typeof events>()
  for (const event of events) {
    byProduct.set(event.productId, [...(byProduct.get(event.productId) ?? []), event])
  }

  const groups = []
  for (const [productId, group] of byProduct) {
    const product = products.find((p) => p.id === productId)
    if (!product) continue
    const impact = summarisePriceGroup({ product, events: group, subscriptions, passOnPct, config })
    groups.push({
      ...impact,
      // "Absorbing drops you to 4% — pass on 40% and you're back above the
      // floor" is a more useful prompt than an all-or-nothing choice.
      suggestedPassOnPct: minimumPassOnPct(impact.currentUnitPrice, impact.move, config),
      noticeDays: config.priceChangeNoticeDays,
    })
  }

  return NextResponse.json({ count: groups.length, groups })
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { productId?: string; action?: string; passOnPct?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.productId) return NextResponse.json({ error: 'productId is required' }, { status: 400 })

  await syncPortalRuntime()

  if (body.action === 'absorb') {
    const resolved = await absorbPriceChange(body.productId)
    return NextResponse.json({ ok: true, action: 'absorb', resolved: resolved.length })
  }

  if (body.action === 'pass-on') {
    const pct = typeof body.passOnPct === 'number' ? body.passOnPct : 1
    const { scheduled, notified } = await schedulePassOn(body.productId, pct)
    return NextResponse.json({
      ok: true,
      action: 'pass-on',
      passOnPct: pct,
      scheduled: scheduled.length,
      notified,
      effectiveFrom: scheduled[0]?.autoApplyAt ?? null,
    })
  }

  return NextResponse.json({ error: "action must be 'absorb' or 'pass-on'" }, { status: 400 })
}
