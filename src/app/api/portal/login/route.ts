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
    path: '/',
    maxAge: 60 * 60 * 12,
  })
  return res
}
