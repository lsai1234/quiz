import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { reportError } from '@/lib/monitoring/report'

export const dynamic = 'force-dynamic'

/**
 * The member hub on its own (`lib/hub-plan`).
 *
 *   GET    → { join, membership }   whether they can join, and their membership
 *   POST   → { checkoutUrl, mock }  start joining: Stripe, or (mock) joined
 *   PATCH  { action: 'cancel' | 'resume' } → { membership }
 *
 * Signed out, GET still answers (the join page shows the price); POST needs
 * an account, because the hub lives in one.
 */
export async function GET() {
  const user = await getHubUser()
  const { joinState, memberHubPlanView } = await import('@/lib/hub-plan/server')
  const [join, membership] = await Promise.all([joinState(user), user ? memberHubPlanView(user.id) : Promise.resolve(null)])
  return NextResponse.json({ join, membership, signedIn: Boolean(user), email: user?.email ?? null })
}

export async function POST(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { startHubPlan, HubPlanRefused } = await import('@/lib/hub-plan/server')
  const origin = process.env.APP_URL || req.headers.get('origin') || new URL(req.url).origin
  try {
    return NextResponse.json({ ok: true, ...(await startHubPlan(user, origin)) })
  } catch (err) {
    if (err instanceof HubPlanRefused) return NextResponse.json({ error: err.code, code: err.code }, { status: err.code === 'off' ? 404 : 409 })
    console.error(`[hub/plan] join failed for ${user.id}:`, err)
    void reportError(err instanceof Error ? err : new Error(String(err)), { surface: 'checkout', severity: 'critical', path: '/api/hub/plan', userId: user.id, context: { stage: 'join' } })
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null
  const action = body?.action
  if (action !== 'cancel' && action !== 'resume') return NextResponse.json({ error: 'action must be cancel or resume' }, { status: 400 })
  const { cancelHubPlan, resumeHubPlan, memberHubPlanView } = await import('@/lib/hub-plan/server')
  try {
    if (action === 'cancel') await cancelHubPlan(user.id)
    else await resumeHubPlan(user.id)
    return NextResponse.json({ ok: true, membership: await memberHubPlanView(user.id) })
  } catch (err) {
    console.error(`[hub/plan] ${action} failed for ${user.id}:`, err)
    void reportError(err instanceof Error ? err : new Error(String(err)), { surface: 'myhub', severity: 'critical', path: '/api/hub/plan', userId: user.id, context: { stage: action } })
    return NextResponse.json({ error: 'failed' }, { status: 502 })
  }
}
