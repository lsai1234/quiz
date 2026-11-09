import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { isAccessory } from '@/lib/catalogue/accessory'
import { memberQuote, sizeFor } from '@/lib/deals/box'
import { variantFor } from '@/lib/deals/engine'
import { DEALS_COPY } from '@/lib/deals/copy'
import { hubMetrics } from '@/lib/hub/metrics'
import { getLiveOfferSettings, saveHubPrice, saveMemberDealSettings } from '@/lib/offer/store'
import { PersistError } from '@/lib/portal/persist'
import { hubOnSale } from '@/lib/offer/settings'

/**
 * Settings → Member hub (founders only).
 *
 *   GET   the switches, member deal sizes by kind, what every product's
 *         member price comes to at those sizes (after the floor), and the
 *         hub's numbers
 *   POST  { memberDeals?: Partial<MemberDealSettings>, hubPrice?: Partial<HubPriceSettings> }
 */
export const dynamic = 'force-dynamic'

/** The hub on its own (`lib/hub-plan`): who's paying, who's on a stack's free days, and the monthly it brings. */
async function hubPlanCounts(now = new Date()) {
  const { listHubPlans } = await import('@/lib/hub-plan/store')
  const { sampleMemberIds } = await import('@/lib/samples/registry')
  const samples = await sampleMemberIds()
  const plans = (await listHubPlans()).filter((p) => !samples.has(p.userId))
  const active = plans.filter((p) => p.status === 'active')
  const onFreeDays = active.filter((p) => p.freeUntil && Date.parse(p.freeUntil) > now.getTime())
  const cancelling = plans.filter((p) => p.status === 'cancelling' && p.endsAt && Date.parse(p.endsAt) > now.getTime())
  return {
    paying: active.length - onFreeDays.length,
    onFreeDays: onFreeDays.length,
    cancelling: cancelling.length,
    monthly: Math.round(active.filter((p) => !onFreeDays.includes(p)).reduce((sum, p) => sum + p.monthly, 0) * 100) / 100,
  }
}

async function payload() {
  const [settings, { products }, metrics, hubPlans] = await Promise.all([getLiveOfferSettings(), getResolvedCatalogue(), hubMetrics(), hubPlanCounts()])
  const sellable = products.filter((p) => !p.isSubscriptionOnly && !isAccessory(p))
  const kinds = [...new Set(sellable.map((p) => p.swapGroup))].sort()
  return {
    services: settings.services,
    memberDeals: settings.memberDeals,
    hubPrice: settings.hubPrice,
    hubOnSale: hubOnSale(settings),
    kinds: kinds.map((k) => ({ kind: k, products: sellable.filter((p) => p.swapGroup === k).length })),
    previews: sellable.map((p) => {
      const v = variantFor(p, null)
      const q = v ? memberQuote(p, v, settings.memberDeals) : null
      return {
        productId: p.id,
        title: p.title,
        kind: p.swapGroup,
        sizePct: Math.round(sizeFor(p, settings.memberDeals) * 100),
        viable: Boolean(q?.viable),
        line: q?.viable ? DEALS_COPY.dealLine(q) : 'No deal: it wouldn’t keep the floor',
        total: q?.total ?? null,
        normalTotal: q?.normalTotal ?? null,
      }
    }),
    metrics,
    hubPlans,
  }
}

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await payload())
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { memberDeals?: unknown; hubPrice?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  try {
    if (body.memberDeals && typeof body.memberDeals === 'object') await saveMemberDealSettings(body.memberDeals as Record<string, unknown>)
    if (body.hubPrice && typeof body.hubPrice === 'object') await saveHubPrice(body.hubPrice as Record<string, unknown>)
  } catch (err) {
    if (err instanceof PersistError) return NextResponse.json({ error: err.message }, { status: 503 })
    throw err
  }
  return NextResponse.json(await payload())
}
