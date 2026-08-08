import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { syncPortalRuntime } from '@/lib/portal/store'
import { getPartnerRecord } from '@/lib/partners'
import { balanceFor } from '@/lib/partners/ledger'
import { listCommissions, listPayouts } from '@/lib/partners/repo'

export const dynamic = 'force-dynamic'

/**
 * One partner's ledger — every commission and every payout.
 *
 * Separate from the list endpoint because it is per-row detail nobody needs
 * until they open a partner, and loading it for everyone would mean reading the
 * whole ledger to draw a summary line.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()

  const { id } = await params
  const partner = await getPartnerRecord(id)
  if (!partner) return NextResponse.json({ error: 'No such partner.' }, { status: 404 })

  const [commissions, payouts, balance] = await Promise.all([
    listCommissions(id),
    listPayouts(id),
    balanceFor(id),
  ])

  return NextResponse.json({ partner, commissions, payouts, balance })
}
