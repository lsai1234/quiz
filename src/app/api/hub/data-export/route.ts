import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { exportAccount } from '@/lib/db/erasure'

export const dynamic = 'force-dynamic'

/**
 * GET /api/hub/data-export — everything we hold about the signed-in member.
 *
 * Article 15 (a copy of your data) and Article 20 (in a portable format) in one
 * endpoint. Self-service rather than an email address to write to: a right that
 * needs a support ticket is one most people never exercise, and answering these
 * by hand out of a database console is how a one-month statutory clock gets
 * missed.
 *
 * Scoped to the session's own user id, never a parameter. An export endpoint
 * that takes a user id is an export endpoint for everyone else's data too.
 */
export async function GET() {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const data = await exportAccount(user.id)
  if (!data) return NextResponse.json({ error: 'No account found' }, { status: 404 })

  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="chrgd-my-data-${stamp}.json"`,
      // A copy of someone's health answers is the last thing that should sit in
      // a shared cache or a CDN edge.
      'Cache-Control': 'no-store, private',
    },
  })
}
