import { NextResponse } from 'next/server'
import { PORTAL_COOKIE } from '@/lib/portal/auth'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  // Attributes must match the cookie we set, or the browser keeps the original.
  res.cookies.set(PORTAL_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return res
}
