import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { GOOGLE_STATE_COOKIE, googleAuthUrl, isGoogleConfigured, resolveOrigin } from '@/lib/auth/google'

/**
 * GET /api/auth/google — kicks off Google sign-in.
 * Sets a short-lived state cookie (CSRF) and redirects to Google's consent
 * screen; Google returns to /api/auth/google/callback.
 */
export async function GET(req: Request) {
  if (!isGoogleConfigured()) {
    return NextResponse.json({ error: 'Google sign-in is not configured' }, { status: 501 })
  }

  const state = crypto.randomBytes(16).toString('base64url')
  const jar = await cookies()
  jar.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60,
    path: '/',
  })

  return NextResponse.redirect(googleAuthUrl(resolveOrigin(req.url), state))
}
