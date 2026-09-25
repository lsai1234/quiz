import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getConsultRollout, setConsultRollout } from '@/lib/portal/store'
import { normaliseConsultRollout } from '@/lib/experiments/consult'

/**
 * Whether the hero offers the Amp Consult, and how (build H11). Founder-only.
 *
 * Like the quiz experiment, every reachable state is legitimate and
 * `normaliseConsultRollout` clamps rather than rejects. A change takes effect
 * on each visitor's next page load: `/api/config` reads it on every call.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ rollout: await getConsultRollout() })
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.rollout || typeof body.rollout !== 'object') {
    return NextResponse.json({ error: 'rollout required' }, { status: 400 })
  }
  // Merge onto what is stored, so one changed field doesn't reset the other.
  await setConsultRollout(normaliseConsultRollout({ ...(await getConsultRollout()), ...body.rollout }))
  return NextResponse.json({ rollout: await getConsultRollout() })
}
