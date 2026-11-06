import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { dealEmailsOff, setDealEmails, stopByToken } from '@/lib/deals/emails'

/**
 * Member price emails, on or off.
 *
 *   GET                       → { on } for the signed-in member
 *   POST { token }            → stop, from an email's link, no sign-in needed
 *   POST { on: boolean }      → the signed-in member's own switch
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getHubUser()
  if (!user?.email) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  return NextResponse.json({ on: !(await dealEmailsOff(user.email)) })
}

export async function POST(req: Request) {
  let body: { token?: unknown; on?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (typeof body.token === 'string') {
    return (await stopByToken(body.token)) ? NextResponse.json({ on: false }) : NextResponse.json({ error: 'Unknown link' }, { status: 404 })
  }
  const user = await getHubUser()
  if (!user?.email) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (typeof body.on !== 'boolean') return NextResponse.json({ error: 'On or off?' }, { status: 400 })
  await setDealEmails(user.email, body.on)
  return NextResponse.json({ on: body.on })
}
