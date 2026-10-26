import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { getOfferSettings, saveBonusSettings, setHeroEnabled } from '@/lib/offer/store'
import { offerView } from '@/lib/offer/view'
import { PersistError } from '@/lib/portal/persist'

/**
 * Settings → Offer (plan Phase 2): the "Hero products" and "Free bonus"
 * switches, the bonus pool and its settings, and the numbers to set them by.
 * Founders only. Both switches are off by default, and while Phase 3 is not
 * built nothing on either quiz reads them.
 *
 *   GET   everything the screen shows
 *   POST  { heroEnabled?: boolean, bonus?: Partial<BonusSettings> }
 */
export const dynamic = 'force-dynamic'

async function payload() {
  const [settings, { products }] = await Promise.all([getOfferSettings(), getResolvedCatalogue()])
  return offerView(settings, products)
}

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await payload())
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { heroEnabled?: unknown; bonus?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  try {
    if (typeof body.heroEnabled === 'boolean') await setHeroEnabled(body.heroEnabled)
    if (body.bonus && typeof body.bonus === 'object') await saveBonusSettings(body.bonus as Record<string, unknown>)
  } catch (err) {
    if (err instanceof PersistError) return NextResponse.json({ error: err.message }, { status: 503 })
    throw err
  }
  return NextResponse.json(await payload())
}
