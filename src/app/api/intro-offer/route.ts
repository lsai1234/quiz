import { NextResponse } from 'next/server'
import { allocateIntroRate } from '@/lib/stack-blueprint/intro-allocation'
import { syncPortalRuntime } from '@/lib/portal/store'
import { getPricingConfig, scratchRevealEnabled } from '@/lib/stack-blueprint/pricing'

export const dynamic = 'force-dynamic'

/**
 * GET /api/intro-offer → { rate }
 *
 * The rate to put under this visitor's scratch card, allocated server-side so
 * the blended discount across actual checkouts tracks the portal's effective
 * discount (see `lib/stack-blueprint/intro-allocation.ts`). Deciding this in the
 * browser would put the giveaway budget in the client's hands.
 *
 * Reading it costs nothing — the ledger only moves when a checkout is finalized,
 * so a visitor who scratches and leaves doesn't spend the budget. `rate: 0` when
 * scratch-to-reveal is switched off.
 */
export async function GET() {
  await syncPortalRuntime()
  const config = getPricingConfig()
  if (!scratchRevealEnabled(config)) return NextResponse.json({ rate: 0 })
  return NextResponse.json({ rate: await allocateIntroRate(config) })
}
