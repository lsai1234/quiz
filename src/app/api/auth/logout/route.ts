import { NextResponse } from 'next/server'
import { endHubSession } from '@/lib/auth/session'

/** POST /api/auth/logout — revoke the DB session and clear the cookie. */
export async function POST() {
  await endHubSession()
  return NextResponse.json({ ok: true })
}
