import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import {
  getCampaign, saveCampaign, missingForLive, competitionState, isTestRun,
  type Campaign, type CampaignStatus,
} from '@/lib/competition/campaign'
import {
  entryCounts, listEntries, setEntryState, drawWinner, importTaggedHandles, setBonusEntries, ticketsFor,
  type CompetitionEntry, type EntryState,
} from '@/lib/competition/entries'

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

/** One CSV cell, quoted, with a leading formula character defused for spreadsheets. */
function cell(value: string | number): string {
  const text = String(value)
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

/**
 * The email entrants, as a spreadsheet.
 *
 * Real entries only — a rehearsal address in the export is how a test inbox
 * ends up on a mailing list. `marketing_opt_in` is its own column because it is
 * the only thing that says who may be emailed about anything but the draw.
 */
function entriesCsv(entries: CompetitionEntry[]): string {
  const header = ['email', 'entered_at', 'route', 'tickets', 'shared', 'marketing_opt_in', 'state']
  const rows = entries
    .filter((e) => e.channel === 'email' && !e.isTest)
    .map((e) => [
      e.handle, e.createdAt, e.route, ticketsFor(e),
      e.bonusEntries > 0 ? 'yes' : 'no', e.marketingOptIn ? 'yes' : 'no', e.state,
    ].map(cell).join(','))
  return [header.join(','), ...rows].join('\r\n') + '\r\n'
}

export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (new URL(req.url).searchParams.get('format') === 'csv') {
    const campaign = await getCampaign()
    const name = (campaign.name || 'competition').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    return new NextResponse(entriesCsv(await listEntries(campaign.name || 'untitled')), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${name || 'competition'}-entries.csv"`,
        'cache-control': 'no-store',
      },
    })
  }
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

  if (action === 'set-bonus') {
    // Taking a share bonus away — somebody who plainly never posted. The entry
    // itself stays; only the ten extra tickets go.
    const id = String(body.id ?? '')
    const bonus = Number(body.bonus)
    if (!id || !Number.isFinite(bonus) || bonus < 0) {
      return NextResponse.json({ error: 'id and a bonus of 0 or more are required' }, { status: 400 })
    }
    await setBonusEntries(id, bonus)
    return NextResponse.json(await payload())
  }

  if (action === 'import-tags') {
    // The whole entrant pipeline, in one paste. The winner is drawn from the
    // accounts that tagged us, which the founder reads off their own Instagram
    // mentions — so this is where entrants come from, and there is no form on
    // the customer's side at all.
    const raw = typeof body.handles === 'string' ? body.handles : ''
    if (!raw.trim()) {
      return NextResponse.json({ error: 'paste some handles first' }, { status: 400 })
    }
    const campaign = await getCampaign()
    const imported = await importTaggedHandles({
      campaign: campaign.name || 'untitled',
      raw,
      isTest: isTestRun(campaign),
    })
    return NextResponse.json({ imported, ...(await payload()) })
  }

  if (action === 'draw') {
    const campaign = await getCampaign()
    const winner = await drawWinner(campaign.name || 'untitled')
    return NextResponse.json({ winner, ...(await payload()) })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
