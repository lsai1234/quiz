import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getHubUser } from '@/lib/auth/session'
import { kvGet, kvDelete } from '@/lib/db/kv'
import { CheckoutRejected, finalizeCheckout, PENDING_COOKIE, PENDING_KEY_PREFIX } from '@/lib/checkout/finalize'
import { requestMetadata } from '@/lib/legal/consent'
import { resolveOrigin } from '@/lib/auth/providers/common'
import { resolveCheckoutCode } from '@/lib/partners/referral'
import type { CheckoutPayload } from '@/lib/checkout/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/checkout/continue — the OAuth return target for the checkout gate.
 * After the provider round-trip the member is signed in; here we read the
 * stashed order, save their bundle + quiz, clear the stash, and redirect on to
 * the Stripe checkout (live) or the hub (mock). Any miss lands on /myhub.
 */
export async function GET(req: Request) {
  const origin = resolveOrigin(req.url)
  const jar = await cookies()
  const token = jar.get(PENDING_COOKIE)?.value
  jar.delete(PENDING_COOKIE)

  const user = await getHubUser()
  if (!user || !token) return NextResponse.redirect(`${origin}/myhub`)

  const stored = await kvGet<{ payload: CheckoutPayload }>(PENDING_KEY_PREFIX + token)
  await kvDelete(PENDING_KEY_PREFIX + token)
  if (!stored?.payload) return NextResponse.redirect(`${origin}/myhub`)

  // The stashed payload carries whatever they typed before the OAuth trip; the
  // cookie is the fallback for someone who typed nothing. Both survive the
  // round-trip — the cookie is the browser's and the payload is ours.
  const payload: CheckoutPayload = {
    ...stored.payload,
    partnerCode: await resolveCheckoutCode(stored.payload.partnerCode),
  }

  try {
    const { checkoutUrl, mock } = await finalizeCheckout(user.id, user.email, payload, {
      origin,
      ...requestMetadata(req),
    })
    if (!mock && checkoutUrl && !checkoutUrl.startsWith('#')) {
      return NextResponse.redirect(checkoutUrl)
    }
  } catch (err) {
    if (err instanceof CheckoutRejected) {
      // Consent was missing or stale by the time they got back from the
      // provider. They're signed in, so send them back to re-confirm rather
      // than landing on a hub with no plan and no explanation.
      console.warn('[checkout/continue] consent rejected:', err.message)
      return NextResponse.redirect(`${origin}/?checkout=consent-required`)
    }
    console.error('[checkout/continue] finalize failed:', err)
  }
  // Mock mode (or a live failure we've logged): land on the hub with the saved bundle.
  return NextResponse.redirect(`${origin}/myhub?welcome=subscribed`)
}
