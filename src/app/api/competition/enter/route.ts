import { NextResponse, type NextRequest } from 'next/server'
import { getCampaign, competitionState, isTestRun } from '@/lib/competition/campaign'
import { enterCompetition, type EntryChannel, type EntryRoute } from '@/lib/competition/entries'

/**
 * Enter the competition.
 *
 * Two routes come through here and they are equals, which is not a design
 * preference — the CAP Code requires a no-purchase-necessary route of equal
 * standing, and a free entry that is harder to make than a shared one is not
 * equal. The only difference in the row is `route`.
 *
 * Nothing here verifies anything. An entry carrying a share token is a *claim*
 * that somebody posted a card, and anyone can mint a token by calling
 * `/api/share` — so every entry lands `pending` and a person confirms it in the
 * Founders Hub before the draw can see it.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CHANNELS: EntryChannel[] = ['instagram', 'tiktok', 'other']
const ROUTES: EntryRoute[] = ['share', 'free']

export async function POST(req: NextRequest) {
  const campaign = await getCampaign()
  const state = competitionState(campaign)

  if (state === 'off') {
    return NextResponse.json({ error: 'no competition is running' }, { status: 404 })
  }
  if (state === 'closed') {
    // Told, not hidden: somebody arriving from an old story deserves to know
    // there was a promotion and that it has ended.
    return NextResponse.json({ error: 'closed', closedAt: campaign.closesAt }, { status: 409 })
  }

  let body: { handle?: unknown; channel?: unknown; route?: unknown; shareToken?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const channel = CHANNELS.includes(body.channel as EntryChannel) ? (body.channel as EntryChannel) : null
  const route = ROUTES.includes(body.route as EntryRoute) ? (body.route as EntryRoute) : null
  if (!channel || !route || typeof body.handle !== 'string') {
    return NextResponse.json({ error: 'handle, channel and route are required' }, { status: 400 })
  }

  const result = await enterCompetition({
    campaign: campaign.name || 'untitled',
    handle: body.handle,
    channel,
    route,
    shareToken: typeof body.shareToken === 'string' ? body.shareToken : null,
    isTest: isTestRun(campaign),
  })

  if (!result.ok) {
    const status = result.reason === 'already-entered' ? 409 : 400
    return NextResponse.json({ error: result.reason }, { status })
  }

  return NextResponse.json({
    ok: true,
    state: result.entry.state,
    test: result.entry.isTest,
  })
}

/** What the entry screens need to render themselves. Public, so no secrets. */
export async function GET() {
  const campaign = await getCampaign()
  const state = competitionState(campaign)

  if (state === 'off') return NextResponse.json({ state: 'off' })

  return NextResponse.json({
    state,
    test: isTestRun(campaign),
    name: campaign.name,
    prize: campaign.prize,
    mechanic: campaign.mechanic,
    closesAt: campaign.closesAt,
    termsUrl: campaign.termsUrl,
    freeEntryRoute: campaign.freeEntryRoute,
    platformDisclaimer: campaign.platformDisclaimer,
    promoterName: campaign.promoterName,
  })
}
