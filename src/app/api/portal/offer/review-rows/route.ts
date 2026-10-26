import { isPortalAuthed } from '@/lib/portal/guard'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { getOfferSettings } from '@/lib/offer/store'
import { offerView } from '@/lib/offer/view'
import { bonusTermRows, heroReviewRows } from '@/lib/offer/review-rows'
import { reviewPackCsv } from '@/lib/consult/review-pack'

/**
 * The live offer rows for the review pack, as CSV in the pack's own columns:
 * one per product flagged as a hero, and the bonus terms as currently set.
 * Founders only.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await isPortalAuthed())) return new Response('Unauthorized', { status: 401 })
  const [settings, { products }] = await Promise.all([getOfferSettings(), getResolvedCatalogue()])
  const view = offerView(settings, products)
  const csv = reviewPackCsv([...heroReviewRows(view.heroes), ...bonusTermRows(settings.bonus)])
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="offer-review-rows-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
