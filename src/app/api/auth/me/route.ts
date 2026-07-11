import { NextResponse } from 'next/server'
import { getHubPublicUser } from '@/lib/auth/session'
import { isGoogleConfigured } from '@/lib/auth/google'

// Session lookups must never be cached.
export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/me → { user: PublicUser | null, googleEnabled: boolean }
 * The hub calls this on load to restore the signed-in state, and uses
 * `googleEnabled` to decide whether to show the Google button.
 */
export async function GET() {
  const user = await getHubPublicUser()
  return NextResponse.json({ user, googleEnabled: isGoogleConfigured() })
}
