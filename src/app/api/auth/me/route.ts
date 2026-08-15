import { NextResponse } from 'next/server'
import { getHubPublicUser } from '@/lib/auth/session'
import { configuredProviders } from '@/lib/auth/providers'
import { canSendFromHub } from '@/lib/notify'

// Session lookups must never be cached.
export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/me
 *   → { user: PublicUser | null, providers: {id,label}[], canResetPassword: boolean }
 *
 * The hub + checkout gate call this on load to restore the signed-in state and
 * to decide which OAuth buttons to show (only configured providers).
 *
 * `canResetPassword` follows the same principle: a "forgot password?" link on a
 * deployment with no email provider is a door with nothing behind it, and the
 * member who taps it goes off to watch an inbox that will never receive
 * anything. Configure a provider, get the link.
 */
export async function GET() {
  const user = await getHubPublicUser()
  return NextResponse.json({
    user,
    providers: configuredProviders(),
    canResetPassword: canSendFromHub(),
  })
}
