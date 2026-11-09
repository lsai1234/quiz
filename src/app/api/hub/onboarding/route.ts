import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

/**
 * POST /api/hub/onboarding  Body: { seed } → { ok }
 *
 * After joining the hub on its own, the quiz runs in hub mode and lands here
 * instead of the results page: their day, goals, first name and training
 * answers, for the training plan's first setup. Checked on the way in
 * (`normaliseGuideSeed`); nothing about their health is kept.
 */
export async function POST(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { seed?: unknown } | null
  if (!body || typeof body.seed !== 'object' || body.seed === null) return NextResponse.json({ error: 'seed is required' }, { status: 400 })
  const { saveHubStart } = await import('@/lib/hub-plan/server')
  await saveHubStart(user.id, body.seed)
  return NextResponse.json({ ok: true })
}
