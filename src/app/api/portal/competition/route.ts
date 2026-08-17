import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import {
  getCampaign, saveCampaign, missingForLive, competitionState,
  type Campaign, type CampaignStatus,
} from '@/lib/competition/campaign'
import { entryCounts, listEntries, setEntryState, drawWinner, type EntryState } from '@/lib/competition/entries'

/**
 * The competition, from the Founders Hub.
 *
 * Reads and writes the campaign record, lists entries, moves them between
 * states, and runs the draw. One route because these are one screen's worth of
 * operations on one object.
 *
 * The guard that matters is `status: 'live'`: a promotion cannot be switched on
 * until every field the CAP Code requires has been filled in, and the response
 * says which are missing rather than refusing flatly.
 */
export const dynamic = 'force-dynamic'

const STATUSES: CampaignStatus[] = ['off', 'test', 'live']
const ENTRY_STATES: EntryState[] = ['pending', 'verified', 'rejected', 'won']

async function payload() {
  const campaign = await getCampaign()
  return {
    campaign,
    state: competitionState(campaign),
    missing: missingForLive(campaign),
    counts: await entryCounts(campaign.name || 'untitled'),
    entries: await listEntries(campaign.name || 'untitled'),
  }
}

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await payload())
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const action = String(body.action ?? 'save')

  if (action === 'save') {
    const patch = body.campaign as Partial<Campaign> | undefined
    if (!patch || typeof patch !== 'object') {
      return NextResponse.json({ error: 'campaign required' }, { status: 400 })
    }
    if (patch.status && !STATUSES.includes(patch.status)) {
      return NextResponse.json({ error: 'status must be off | test | live' }, { status: 400 })
    }
    // The one refusal on this route. Going live with a missing closing date or
    // no free entry route is not a bad setting, it is an unlawful promotion.
    if (patch.status === 'live') {
      const missing = missingForLive({ ...(await getCampaign()), ...patch })
      if (missing.length > 0) {
        return NextResponse.json({ error: 'not ready to go live', missing }, { status: 422 })
      }
    }
    await saveCampaign(patch)
    return NextResponse.json(await payload())
  }

  if (action === 'set-state') {
    const id = String(body.id ?? '')
    const state = body.state as EntryState
    if (!id || !ENTRY_STATES.includes(state)) {
      return NextResponse.json({ error: 'id and a valid state are required' }, { status: 400 })
    }
    await setEntryState(id, state, typeof body.note === 'string' ? body.note : null)
    return NextResponse.json(await payload())
  }

  if (action === 'draw') {
    const campaign = await getCampaign()
    const winner = await drawWinner(campaign.name || 'untitled')
    return NextResponse.json({ winner, ...(await payload()) })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
