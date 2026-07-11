import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getHubUser } from '@/lib/auth/session'
import { kvGet, kvDelete } from '@/lib/db/kv'
import { finalizeCheckout, PENDING_COOKIE, PENDING_KEY_PREFIX } from '@/lib/checkout/finalize'
import { resolveOrigin } from '@/lib/auth/providers/common'
import type { CheckoutPayload } from '@/lib/checkout/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/checkout/continue — the OAuth return target for the checkout gate.
 * After the provider round-trip the member is signed in; here we read the
 * stashed order, save their bundle + quiz, clear the stash, and redirect on to
 * the Shopify checkout (live) or the hub (mock). Any miss lands on /hub.
 */
export async function GET(req: Request) {
  const origin = resolveOrigin(req.url)
  const jar = await cookies()
  const token = jar.get(PENDING_COOKIE)?.value
  jar.delete(PENDING_COOKIE)

  const user = await getHubUser()
  if (!user || !token) return NextResponse.redirect(`${origin}/hub`)

  const stored = await kvGet<{ payload: CheckoutPayload }>(PENDING_KEY_PREFIX + token)
  await kvDelete(PENDING_KEY_PREFIX + token)
  if (!stored?.payload) return NextResponse.redirect(`${origin}/hub`)

  try {
    const { checkoutUrl, mock } = await finalizeCheckout(user.id, user.email, stored.payload)
    if (!mock && checkoutUrl && !checkoutUrl.startsWith('#')) {
      return NextResponse.redirect(checkoutUrl)
    }
  } catch (err) {
    console.error('[checkout/continue] finalize failed:', err)
  }
  // Mock mode (or a live failure we've logged): land on the hub with the saved bundle.
  return NextResponse.redirect(`${origin}/hub?welcome=subscribed`)
}
