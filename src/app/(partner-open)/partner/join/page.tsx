import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AffiliateJoin } from '@/components/partner/AffiliateJoin'

export const dynamic = 'force-dynamic'

/**
 * `/partner/join?token=…` — the front door for an affiliate.
 *
 * Deliberately OUTSIDE the `(partner-gated)` group, for the reason
 * `/partner/claim` and `/partner/set-password` are: somebody following a link
 * from a message has no session, and a gate here would lock out exactly the
 * people it is for. The link itself is the credential, and it is single-use.
 *
 * No token means they arrived without one — the sign-in screen is what they
 * actually want, and it is one redirect away.
 */
export default async function AffiliateJoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) redirect('/partner')

  // `useSearchParams` reads the token client-side, which Next requires a
  // boundary for even on a dynamic page.
  return (
    <Suspense fallback={null}>
      <AffiliateJoin />
    </Suspense>
  )
}
