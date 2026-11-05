import { NextResponse } from 'next/server'
import { rateLimiter } from '@/lib/consult/ai/guard'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { normaliseGuideSeed } from '@/lib/guide/build'
import { dealsPreview, trainingPreview, type HubPreview } from '@/lib/hub-preview/build'
import { getOfferSettings } from '@/lib/offer/store'

/**
 * POST /api/hub-preview { productIds, plan, guide } → HubPreview
 *
 * The results page's look at the hub: a first training week from their
 * answers (the guide seed the order will carry: their day, goals and how they
 * train) and the member price each product in their box would get. Only what
 * is switched on; member prices only for a one-off box (a monthly plan ships
 * its products at the monthly price). No sign-in, no AI, nothing stored.
 */
export const dynamic = 'force-dynamic'

const busy = rateLimiter(300, 60_000)

export async function POST(req: Request) {
  if (busy()) return NextResponse.json({ training: null, deals: null } satisfies HubPreview, { status: 429 })
  let body: { productIds?: unknown; plan?: unknown; guide?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const ids = Array.isArray(body.productIds) ? body.productIds.filter((x): x is string => typeof x === 'string').slice(0, 12) : []
  const seed = normaliseGuideSeed(body.guide)
  const { services } = await getOfferSettings()

  const preview: HubPreview = { training: null, deals: null }
  if (services.training) preview.training = trainingPreview({ day: seed.day, goals: seed.goals, training: seed.training ?? null })
  if (services.deals && body.plan === 'oneoff' && ids.length) {
    const { products } = await getResolvedCatalogue()
    const byId = new Map(products.map((p) => [p.id, p]))
    preview.deals = dealsPreview(ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p)), seed.day.trainDays)
  }
  return NextResponse.json(preview)
}
