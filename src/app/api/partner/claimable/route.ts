import { NextResponse } from 'next/server'
import { starterForSession } from '@/lib/partner-starter/redeem'

export const dynamic = 'force-dynamic'

/**
 * GET /api/partner/claimable → { claimable: boolean }
 *
 * "Does the person on this session have a free stack to claim right now?"
 *
 * ── Why the reveal has to ask ───────────────────────────────────────────────
 * The quiz knows it is a claim from a flag in `sessionStorage`, which is an
 * intent and not a credential — anyone can set it, and a real partner can have
 * set it honestly and then lost their session (a different device, a cleared
 * cookie, thirty days). Trusting it to DISPLAY a price put £0.00 on screen in
 * front of people the checkout then charged in full. A screen that disagrees
 * with the card is the one failure this journey cannot have, and it is worse
 * than an honest full price.
 *
 * So the flag decides whether to ask; this decides the answer.
 *
 * ── Why it says so little ───────────────────────────────────────────────────
 * One boolean. It is on the path of a page render, it is asked by people who
 * are mid-quiz, and everything else about the starter — the cap, the terms, the
 * agreement — is already on the screen they claimed it from. A refusal reason
 * is deliberately absent too: there is nothing useful to say to somebody
 * halfway through a quiz, and the honest outcome is simply the ordinary reveal
 * at the ordinary price.
 */
export async function GET() {
  const found = await starterForSession({ channel: 'quiz' }).catch(() => null)
  return NextResponse.json({ claimable: found?.ok === true })
}
