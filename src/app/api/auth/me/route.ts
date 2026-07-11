import { NextResponse } from 'next/server'
import { getHubPublicUser } from '@/lib/auth/session'
import { configuredProviders } from '@/lib/auth/providers'

// Session lookups must never be cached.
export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/me → { user: PublicUser | null, providers: {id,label}[] }
 * The hub + checkout gate call this on load to restore the signed-in state and
 * to decide which OAuth buttons to show (only configured providers).
 */
export async function GET() {
  const user = await getHubPublicUser()
  return NextResponse.json({ user, providers: configuredProviders() })
}
