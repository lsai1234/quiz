import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { syncPortalRuntime } from '@/lib/portal/store'
import { getHubUser } from '@/lib/auth/session'
import { getPartnerRecord } from '@/lib/partners'
import { createStarter, listStartersForPartner, revokeStarter } from '@/lib/partner-starter/repo'
import { getAgreement } from '@/lib/partner-starter/repo'
import { STARTER_GOODS_CAP, starterState } from '@/lib/partner-starter/rules'
import type { StarterTier } from '@/lib/partner-starter/types'

export const dynamic = 'force-dynamic'

/**
 * Issuing a partner their free stack, from the Founders Hub.
 *
 * ── Why a founder issues it rather than a partner claiming one ──────────────
 * Because it is the offer, not a feature. "Your own stack, free" is what the
 * outreach message promises to a partner we have chosen; a self-serve button
 * would make it something anybody who reached the portal could take.
 *
 * The signing happens at the other end, in the partner's own account
 * (`/api/partner/starter`), and until it does the code buys nothing. Issuing is
 * therefore a cheap, reversible act — which is what it should be.
 */

async function rows(partnerId: string) {
  const starters = await listStartersForPartner(partnerId)
  return Promise.all(
    starters.map(async (s) => ({
      ...s,
      state: starterState(s),
      agreement: s.agreementId ? await getAgreement(s.agreementId) : null,
    })),
  )
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()
  const { id } = await params
  return NextResponse.json({ starters: await rows(id), cap: STARTER_GOODS_CAP })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()

  const { id } = await params
  const partner = await getPartnerRecord(id)
  if (!partner) return NextResponse.json({ error: 'No such partner.' }, { status: 404 })

  let body: { note?: unknown; goodsCap?: unknown; revoke?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  if (typeof body.revoke === 'string') {
    await revokeStarter(body.revoke)
    return NextResponse.json({ starters: await rows(id) })
  }

  /*
    The depth is no longer chosen here — the partner picks Essentials or
    Balanced on their own reveal. The column stays on the row (dropping one is
    the schema change SQLite is awkward about, and an unread string costs
    nothing) and every new starter takes the same default, so nothing reads it
    as a constraint any more.
  */
  const tier: StarterTier = 'performance'

  /*
    One live starter per partner. Two is not a bigger gift, it is a second free
    box for somebody who has already had one — and the second is the one nobody
    remembers issuing. A used or expired one does not block: re-issuing after
    either is a deliberate decision somebody is making with the history in
    front of them.
  */
  const existing = await listStartersForPartner(id)
  if (existing.some((s) => ['unsigned', 'ready'].includes(starterState(s)))) {
    return NextResponse.json(
      { error: 'This partner already has a starter that has not been used. Cancel it first.' },
      { status: 409 },
    )
  }

  const cap = typeof body.goodsCap === 'number' && body.goodsCap > 0 ? body.goodsCap : undefined
  const user = await getHubUser().catch(() => null)
  const starter = await createStarter({
    partnerId: id,
    tier,
    goodsCap: cap,
    note: typeof body.note === 'string' ? body.note : null,
    createdBy: user?.email ?? null,
  })

  return NextResponse.json({ starter, starters: await rows(id) })
}
