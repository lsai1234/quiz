import { NextResponse } from 'next/server'
import { stopByToken } from '@/lib/training/emails'

/**
 * POST { token } → stop a member's training emails from the link in one, no
 * sign-in needed. Signed in, they switch them on and off from their plan
 * (`/api/hub/training`, action "reminders").
 */
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let body: { token?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (typeof body.token !== 'string') return NextResponse.json({ error: 'Which link?' }, { status: 400 })
  return (await stopByToken(body.token)) ? NextResponse.json({ stopped: true }) : NextResponse.json({ error: 'Unknown link' }, { status: 404 })
}
