import { NextResponse } from 'next/server'
import { PORTAL_COOKIE, verifyFounder } from '@/lib/portal/auth'

export async function POST(req: Request) {
  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const result = verifyFounder(body.email ?? '', body.password ?? '')
  if (!result) {
    return NextResponse.json({ error: 'Incorrect email or password' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true, founder: result.founder })
  res.cookies.set(PORTAL_COOKIE, result.token, {
    httpOnly: true,
    sameSite: 'lax',
    // The session is the whole hub — never let it travel in clear. Off in dev so
    // http://localhost still works.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  })
  return res
}
