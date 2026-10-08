import { NextResponse, type NextRequest } from 'next/server'
import { getCampaign, competitionState } from '@/lib/competition/campaign'
import { claimShareBonus, ticketsFor } from '@/lib/competition/entries'

/**
 * Claim the share bonus: ten extra tickets for sharing the card.
 *
 * `{ id }` is the entry id `/api/competition/enter` handed back. The browser
 * calls this when the share sheet reports the card went out — which tells us a
 * share completed, not that a story was posted, so the Founders Hub lists who
 * claimed it and can take it away. Repeating it is harmless: the bonus is set
 * once, never stacked.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const campaign = await getCampaign()
  if (competitionState(campaign) !== 'open') {
    return NextResponse.json({ error: 'no competition is open' }, { status: 409 })
  }

  let body: { id?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  if (typeof body.id !== 'string' || !body.id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const entry = await claimShareBonus(body.id, campaign.name || 'untitled')
  if (!entry) return NextResponse.json({ error: 'not-found' }, { status: 404 })

  return NextResponse.json({ ok: true, tickets: ticketsFor(entry), shared: true })
}
