import { NextResponse } from 'next/server'
import { endHubSession, getHubUser } from '@/lib/auth/session'
import { isSampleEmail } from '@/lib/samples/domain'
import { closeTestView } from '@/lib/samples/session'
import { clearTestViewCookies } from '@/lib/samples/cookies'

/**
 * POST /api/test-view/leave
 *
 * Ends this browser's test view (the banner's "Leave test view"): the live
 * settings again, and out of any sample member's account. Anyone may call it;
 * it only ever turns test views off.
 */
export const dynamic = 'force-dynamic'

export async function POST() {
  const token = await clearTestViewCookies()
  await closeTestView(token)
  const current = await getHubUser().catch(() => null)
  if (current && isSampleEmail(current.email)) await endHubSession()
  return NextResponse.json({ ok: true })
}
