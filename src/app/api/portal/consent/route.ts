import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { acceptedTermsVersionsByUser } from '@/lib/legal/consent'
import { campaignReport } from '@/lib/legal/campaign'
import { listSubscriptions } from '@/lib/db/hub-data'
import { SETTLEMENT_TERMS_VERSION, TERMS_VERSION } from '@/lib/legal/content'

export const dynamic = 'force-dynamic'

/**
 * How far the re-consent campaign has got.
 *
 * The figure that matters is `preSettlement` + `none`: the members whose exits
 * cost nothing whatever the arithmetic says, because they never accepted terms
 * that disclose a settlement. It is how much of the base the feature cannot
 * apply to, and therefore what the campaign is worth — a founder deciding
 * whether this earns its keep needs that number more than any other on the page.
 */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [subscriptions, versionsByUser] = await Promise.all([
    listSubscriptions(),
    acceptedTermsVersionsByUser(),
  ])

  const report = campaignReport(
    subscriptions.map(({ userId, subscription }) => ({
      userId,
      email: subscription.customerEmail ?? null,
      acceptedTermsVersions: versionsByUser.get(userId) ?? [],
    })),
  )

  return NextResponse.json({ ...report, termsVersion: TERMS_VERSION, settlementVersion: SETTLEMENT_TERMS_VERSION })
}
