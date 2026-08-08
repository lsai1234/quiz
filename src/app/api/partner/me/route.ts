import { NextResponse } from 'next/server'
import { getSessionPartner } from '@/lib/partners/auth'
import { dashboardFor } from '@/lib/partners/dashboard'
import { syncPortalRuntime } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

/**
 * GET /api/partner/me → everything the partner can see about themselves.
 *
 * The partner id comes from the SESSION and nothing else. There is deliberately
 * no id in the request — no shape of call from this endpoint can read another
 * partner's numbers, rather than that being guarded by a check somebody has to
 * remember to write.
 */
export async function GET() {
  const partner = await getSessionPartner()
  if (!partner) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  // The payout wording quotes `PRICING_CONFIG.partners`, so it has to be the
  // live config rather than whatever this process last saw.
  await syncPortalRuntime()

  const dashboard = await dashboardFor(partner.id)
  if (!dashboard) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  return NextResponse.json(dashboard)
}
