import { NextResponse } from 'next/server'
import { PORTAL_COOKIE, expectedToken, verifyPassword } from '@/lib/portal/auth'

export async function POST(req: Request) {
  let body: { password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!verifyPassword(body.password ?? '')) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(PORTAL_COOKIE, expectedToken(), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12,
  })
  return res
}
