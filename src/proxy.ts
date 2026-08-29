import { NextResponse, type NextRequest } from 'next/server'
import {
  ARM_COOKIE, BUCKET_COOKIE, mintBucket, parseArm, parseBucket,
} from '@/lib/experiments/assignment'

/**
 * Two things that have to happen before a page renders, and cannot happen
 * inside it: capturing a partner's referral code, and giving the visitor a
 * stable bucket number for the quiz experiment.
 *
 * (Renamed from `middleware.ts`: the middleware file convention is deprecated
 * in Next 16 and this is the same thing under its new name. Proxy now defaults
 * to the Node.js runtime.)
 *
 * ── Referral capture ────────────────────────────────────────────────────────
 * A partner posts one link. Nobody who follows it should have to remember a
 * code and type it back in at checkout three screens later — that gap is where
 * the attribution goes missing, and a partner who brought the customer in but
 * earns nothing has a real complaint.
 *
 * Deliberately a cookie and not a session: the visitor is usually a guest with
 * no account yet, and the whole point is that it survives them browsing, going
 * away and coming back. Thirty days matches the ordinary affiliate window.
 *
 * A code TYPED at checkout always wins over this — the cookie is a fallback for
 * someone who never typed anything, not an override. That is enforced in the
 * checkout paths, which read the typed value first.
 *
 * The value is stored raw and validated at checkout, never here. Proxy runs
 * with no database, and a cookie that has been through `redeemPartnerCode`
 * would go stale the moment the code was paused anyway.
 *
 * ── Quiz bucket ─────────────────────────────────────────────────────────────
 * A single integer 0–99, minted once and then left alone. This file knows
 * NOTHING about the quiz experiment — not whether it is running, not the split.
 * It hands out an anonymous number and stops. The decision lives in
 * `lib/experiments/assignment.ts`, where the settings are readable, which is
 * what lets the bucket be minted for everyone and stay completely inert while
 * the experiment is off.
 *
 * `?quizArm=v2` pins an arm outright, for QA and founder review.
 */
export const REFERRAL_COOKIE = 'partner_ref'
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60
const NINETY_DAYS_SECONDS = 90 * 24 * 60 * 60

/** Codes are `[A-Z0-9-]` after normalising; anything else is not one of ours. */
const PLAUSIBLE = /^[A-Za-z0-9-]{2,32}$/

export function proxy(req: NextRequest) {
  const response = NextResponse.next()

  const ref = req.nextUrl.searchParams.get('ref')
  if (ref && PLAUSIBLE.test(ref)) {
    response.cookies.set(REFERRAL_COOKIE, ref.toUpperCase(), {
      maxAge: THIRTY_DAYS_SECONDS,
      path: '/',
      sameSite: 'lax',
      httpOnly: false, // the basket reads it to pre-fill the code box
    })
  }

  // Mint the bucket once. Re-minting on every request would reshuffle people
  // between arms mid-visit and make the experiment unreadable.
  if (parseBucket(req.cookies.get(BUCKET_COOKIE)?.value) == null) {
    response.cookies.set(BUCKET_COOKIE, String(mintBucket()), {
      maxAge: NINETY_DAYS_SECONDS,
      path: '/',
      sameSite: 'lax',
      httpOnly: false, // no secret in it, and the client mirrors the arm anyway
    })
  }

  const pinned = parseArm(req.nextUrl.searchParams.get('quizArm'))
  if (pinned) {
    response.cookies.set(ARM_COOKIE, pinned, {
      maxAge: NINETY_DAYS_SECONDS,
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
    })
  }

  return response
}

export const config = {
  /**
   * Page requests only. A referral link lands on a page and a visitor arrives
   * on one; running this on every asset and API call would cost far more than
   * it could ever catch.
   */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
