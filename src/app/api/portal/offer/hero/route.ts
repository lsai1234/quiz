import { NextResponse } from 'next/server'
import { getFounder } from '@/lib/portal/guard'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { getOfferSettings, saveHeroApproval } from '@/lib/offer/store'
import { heroView } from '@/lib/offer/view'
import { PersistError } from '@/lib/portal/persist'
import type { HeroApproval } from '@/lib/offer/settings'

/**
 * One product's "Hero" setting and its checks (plan Phase 2, 1). Founders only.
 *
 *   GET   ?id=<product id>
 *   POST  { id, approval: Partial<HeroApproval> }
 *
 * Who saved it, and when, are stamped from the signed-in founder; "Checked by"
 * is the name the founder types, which can be someone else (a pharmacist).
 */
export const dynamic = 'force-dynamic'

const EDITABLE: (keyof HeroApproval)[] = ['hero', 'legalGB', 'novelFood', 'safetyReviewed', 'safetyNotes', 'claimId', 'checkedBy', 'checkedAt']

async function view(id: string) {
  const [settings, { products }] = await Promise.all([getOfferSettings(), getResolvedCatalogue()])
  return heroView(settings, id, products.find((p) => p.id === id))
}

export async function GET(req: Request) {
  if (!(await getFounder())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!id || id.length > 200) return NextResponse.json({ error: 'id required' }, { status: 400 })
  return NextResponse.json(await view(id))
}

export async function POST(req: Request) {
  const founder = await getFounder()
  if (!founder) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { id?: unknown; approval?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id || id.length > 200) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const raw = (body.approval && typeof body.approval === 'object' ? body.approval : {}) as Record<string, unknown>
  const patch = Object.fromEntries(EDITABLE.filter((k) => k in raw).map((k) => [k, raw[k]])) as Partial<HeroApproval>
  try {
    await saveHeroApproval(id, patch, founder.email)
  } catch (err) {
    if (err instanceof PersistError) return NextResponse.json({ error: err.message }, { status: 503 })
    throw err
  }
  return NextResponse.json(await view(id))
}
