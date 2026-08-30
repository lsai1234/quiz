import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { getQuiz } from '@/lib/db/hub-data'
import { listConsents, requestMetadata } from '@/lib/legal/consent'
import { healthConsentIsCurrent, withdrawHealthConsent } from '@/lib/legal/health-data'
import type { QuizAnswers } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * The withdrawal side of the Article 9 consent.
 *
 * Article 7(3): withdrawing has to be as easy as giving. The privacy notice and
 * the consent document both promise this can be done from the account, and a
 * promise in a legal document that the code does not keep is worse than not
 * having made it.
 *
 * GET  → whether they gave it, and when
 * POST → withdraw it
 *
 * ── What withdrawal has to do to the subscription ───────────────────────────
 * These answers are what the product exclusions run on. Simply forgetting them
 * and carrying on would leave automatic substitutions running with no safety
 * filter — the exact failure this branch started by fixing — so every line is
 * switched to `remove`.
 *
 * That is the documented safe fallback: when a product goes and nothing suitable
 * can be found, the line comes off and the member's monthly drops rather than
 * something unverified being sent. Removing costs them money they get back;
 * shipping the wrong thing might not be undoable. It is also exactly what the
 * privacy notice says will happen, which is the point.
 */
export async function GET() {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const quiz = await getQuiz<{ answers?: QuizAnswers }>(user.id)
  const consent = quiz?.answers?.healthDataConsent ?? null
  const withdrawn = (await listConsents(user.id)).some((c) => c.context === 'health-data-withdrawn')

  return NextResponse.json({
    given: healthConsentIsCurrent(consent) && !withdrawn,
    at: consent?.at ?? null,
    // What they actually told us, so the screen can say what withdrawing loses
    // rather than describing it in the abstract.
    flags: quiz?.answers?.safetyFlags ?? [],
  })
}

export async function POST(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const result = await withdrawHealthConsent(user.id, requestMetadata(req))
  return NextResponse.json({ ok: true, ...result })
}
