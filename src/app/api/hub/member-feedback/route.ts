import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

/**
 * POST /api/hub/member-feedback  { text } → { ok } | { error }
 *
 * The hub's feedback page: anything a signed-in member wants to tell us, for
 * the founders to read in Settings → Member feedback (`lib/member-feedback`).
 *
 * Not `/api/hub/feedback`, which is the check-in about their products.
 *
 * Anyone signed in can send one, plan or not: someone deciding whether to buy
 * has as much to tell us as someone who has. Capped in length and at a few a
 * day per member, so the inbox stays readable.
 */
export async function POST(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Sign in to send feedback.' }, { status: 401 })

  let body: { text?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { checkFeedbackText, addMemberFeedback, FEEDBACK_PER_DAY } = await import('@/lib/member-feedback/store')
  const checked = checkFeedbackText(body.text)
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })

  const { hubAccess } = await import('@/lib/hub/access')
  const access = await hubAccess(user).catch(() => null)
  const saved = await addMemberFeedback({
    text: checked.text,
    userId: user.id,
    email: user.email ?? null,
    name: user.name ?? null,
    access: access?.state ?? 'none',
  })
  if (saved === 'too-many') {
    return NextResponse.json(
      { error: `You’ve sent ${FEEDBACK_PER_DAY} today, which is as many as we take in a day. Thank you, and do send more tomorrow.` },
      { status: 429 },
    )
  }
  return NextResponse.json({ ok: true })
}
