import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getTopProductIds, setTopProductIds, syncPortalRuntime } from '@/lib/portal/store'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { productReadiness } from '@/lib/portal/readiness'
import { auditProductPrice } from '@/lib/pricing/good-price'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'
import { TOP_PRODUCT_LIMIT, reorder, resolveRoster, normaliseRoster } from '@/lib/portal/top-products'

export const dynamic = 'force-dynamic'

/**
 * The Top 25 roster — the products the quiz reaches for first.
 *
 * GET returns the roster in order with everything that has to be right for a
 * product to be on it: readiness, cost, margin against the Good-price model.
 * Being on the roster is a promise that its data is maintained, so the screen
 * shows that promise being kept or broken rather than making a founder go and
 * check three other pages.
 *
 * POST { ids } replaces the roster; POST { action: 'add' | 'remove' | 'move' }
 * edits it one entry at a time.
 */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()

  const [ids, catalogue] = await Promise.all([getTopProductIds(), getResolvedCatalogue()])
  const config = getPricingConfig()
  const live = catalogue.source === 'shopify'
  const onRoster = new Set(ids)

  const roster = resolveRoster(ids, catalogue.products).map((slot) => ({
    rank: slot.rank,
    productId: slot.productId,
    product: slot.product,
    readiness: slot.product ? productReadiness(slot.product, { live }) : null,
    price: slot.product ? auditProductPrice(slot.product, config) : null,
  }))

  return NextResponse.json({
    limit: TOP_PRODUCT_LIMIT,
    roster,
    // Everything else, so a founder can fill the remaining places without leaving.
    candidates: catalogue.products
      .filter((p) => !onRoster.has(p.id))
      .map((p) => ({
        id: p.id,
        title: p.title,
        category: p.category,
        basePrice: p.basePrice,
        cost: p.cost ?? null,
        subscriptionEligible: p.subscriptionEligible,
        readiness: productReadiness(p, { live }).overall,
      }))
      .sort((a, b) => a.title.localeCompare(b.title)),
  })
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { ids?: unknown; action?: string; productId?: string; direction?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const current = await getTopProductIds()

  if (Array.isArray(body.ids)) {
    await setTopProductIds(normaliseRoster(body.ids.filter((i): i is string => typeof i === 'string')))
    return NextResponse.json({ ok: true, ids: await getTopProductIds() })
  }

  const productId = body.productId
  if (!productId) return NextResponse.json({ error: 'productId is required' }, { status: 400 })

  switch (body.action) {
    case 'add': {
      if (current.includes(productId)) return NextResponse.json({ ok: true, ids: current })
      if (current.length >= TOP_PRODUCT_LIMIT) {
        return NextResponse.json(
          { error: `The Top ${TOP_PRODUCT_LIMIT} is full — take something off before adding.` },
          { status: 409 },
        )
      }
      await setTopProductIds([...current, productId])
      break
    }
    case 'remove':
      await setTopProductIds(current.filter((id) => id !== productId))
      break
    case 'move':
      await setTopProductIds(reorder(current, productId, body.direction === 1 ? 1 : -1))
      break
    default:
      return NextResponse.json({ error: 'action must be add | remove | move' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, ids: await getTopProductIds() })
}
