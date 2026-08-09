/**
 * The referral cookie, read on the server.
 *
 * `middleware.ts` banks `?ref=SARAH20` into a cookie when someone follows a
 * partner's link. Reading it back HERE — rather than only in the checkout UI —
 * is what makes attribution independent of which screen a customer bought from.
 *
 * The box on the basket applies it too, and that is the version a customer can
 * see and remove. But it can only do that if it mounted and had time to run: an
 * express "Buy now" goes straight to Stripe, and a referral that depended on a
 * component rendering first would be lost silently, which is the exact failure
 * the link exists to prevent.
 *
 * A code TYPED at checkout always wins. This is a fallback for someone who
 * typed nothing, never an override.
 *
 * Server-only (next/headers).
 */
import { cookies } from 'next/headers'

export const REFERRAL_COOKIE = 'partner_ref'

/**
 * The code to attribute this checkout to: what they typed, or failing that what
 * their link left behind.
 *
 * Returns null when there is neither. Validation happens downstream in
 * `redeemPartnerCode` — a cookie is just a string somebody's browser is holding,
 * and it can go stale between the click and the purchase.
 */
export async function resolveCheckoutCode(typed: string | null | undefined): Promise<string | null> {
  const entered = typeof typed === 'string' ? typed.trim() : ''
  if (entered) return entered

  try {
    const jar = await cookies()
    return jar.get(REFERRAL_COOKIE)?.value?.trim() || null
  } catch {
    // No request context (a background job raising an order, say). Not an
    // error — there is simply no browser to have a cookie.
    return null
  }
}
