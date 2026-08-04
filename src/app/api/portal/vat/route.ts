import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { listOrders } from '@/lib/orders/repo'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { buildVatPosition } from '@/lib/pricing/vat-position'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'
import { syncPortalRuntime } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

/**
 * GET /api/portal/vat — where we stand on VAT registration.
 *
 * Turnover comes from real orders; the cost ratio and typical shipped weight
 * come from the catalogue, so the "what would registering cost" figure is
 * modelled on what we actually sell rather than on a guess.
 */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()

  const config = getPricingConfig()
  const [orders, catalogue] = await Promise.all([listOrders({ limit: 500 }), getResolvedCatalogue()])

  const costed = catalogue.products.filter((p) => p.cost != null && p.basePrice > 0)
  const averageCostRatio =
    costed.length > 0
      ? costed.reduce((s, p) => s + p.cost! / p.basePrice, 0) / costed.length
      : config.defaultCostRatio

  const weighed = catalogue.products.filter((p) => p.weightGrams != null && p.weightGrams > 0)
  const averageGrams =
    weighed.length > 0
      ? Math.round(weighed.reduce((s, p) => s + p.weightGrams!, 0) / weighed.length)
      : config.delivery.defaultProductGrams

  return NextResponse.json({
    position: buildVatPosition({ orders, config, averageCostRatio, averageGrams }),
    basis: {
      averageCostRatio: Math.round(averageCostRatio * 1000) / 1000,
      averageGrams,
      productsCosted: costed.length,
      productsWeighed: weighed.length,
      catalogueSize: catalogue.products.length,
    },
  })
}
