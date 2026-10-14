import { NextResponse, type NextRequest } from 'next/server'
import { getCampaign, competitionState } from '@/lib/competition/campaign'
import { claimFollowBonus, claimShareBonus, ticketsFor } from '@/lib/competition/entries'

/**
 * Claim a bonus: ten extra tickets for sharing the card, three for following us.
 *
 * `{ id, kind }` — the entry id `/api/competition/enter` handed back, and which
 * bonus (`share` when it is missing, which is what every caller sent before the
 * follow bonus existed). The browser calls this when the share sheet reports the
 * card went out, or when somebody presses "Follow" — which tells us a button was
 * pressed, not that a story was posted or an account followed, so the Founders
 * Hub lists who claimed what and can take either away. Repeating it is
 * harmless: each bonus is set once, never stacked.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const campaign = await getCampaign()
  if (competitionState(campaign) !== 'open') {
    return NextResponse.json({ error: 'no competition is open' }, { status: 409 })
  }

  let body: { id?: unknown; kind?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  if (typeof body.id !== 'string' || !body.id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }
  const kind = body.kind ?? 'share'
  if (kind !== 'share' && kind !== 'follow') {
    return NextResponse.json({ error: 'kind must be share or follow' }, { status: 400 })
  }

  const name = campaign.name || 'untitled'
  const entry = kind === 'follow' ? await claimFollowBonus(body.id, name) : await claimShareBonus(body.id, name)
  if (!entry) return NextResponse.json({ error: 'not-found' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    tickets: ticketsFor(entry),
    shared: entry.bonusEntries > 0,
    followed: entry.followEntries > 0,
  })
}
