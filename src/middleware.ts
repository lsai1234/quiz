import { NextResponse, type NextRequest } from 'next/server'

/**
 * Capture a partner's referral code from `?ref=SARAH20` into a cookie.
 *
 * A partner posts one link. Nobody who follows it should have to remember a code
 * and type it back in at checkout three screens later — that gap is where the
 * attribution goes missing, and a partner who brought the customer in but earns
 * nothing has a real complaint.
 *
 * Deliberately a cookie and not a session: the visitor is usually a guest with
 * no account yet, and the whole point is that it survives them browsing, going
 * away and coming back. Thirty days matches the ordinary affiliate window.
 *
 * A code TYPED at checkout always wins over this — the cookie is a fallback for
 * someone who never typed anything, not an override. That is enforced in the
 * checkout paths, which read the typed value first.
 *
 * The value is stored raw and validated at checkout, never here. Middleware runs
 * on the edge with no database, and a cookie that has been through
 * `redeemPartnerCode` would go stale the moment the code was paused anyway.
 */
export const REFERRAL_COOKIE = 'partner_ref'
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60

/** Codes are `[A-Z0-9-]` after normalising; anything else is not one of ours. */
const PLAUSIBLE = /^[A-Za-z0-9-]{2,32}$/

export function middleware(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref')
  const response = NextResponse.next()

  if (ref && PLAUSIBLE.test(ref)) {
    response.cookies.set(REFERRAL_COOKIE, ref.toUpperCase(), {
      maxAge: THIRTY_DAYS_SECONDS,
      path: '/',
      sameSite: 'lax',
      httpOnly: false, // the basket reads it to pre-fill the code box
    })
  }

  return response
}

export const config = {
  /**
   * Page requests only. A referral link lands on a page; running this on every
   * asset and API call would cost far more than it could ever catch.
   */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
