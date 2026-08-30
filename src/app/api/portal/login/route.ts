import { NextResponse } from 'next/server'
import { PORTAL_COOKIE, PORTAL_SESSION_TTL_MS, verifyFounder } from '@/lib/portal/auth'
import { loginAllowed, recordFailure, recordSuccess } from '@/lib/portal/rate-limit'
import { requestMetadata } from '@/lib/legal/consent'

export async function POST(req: Request) {
  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const email = body.email ?? ''
  const { ip } = requestMetadata(req)

  // Checked before the password is compared, so a locked-out caller never
  // reaches the comparison. See lib/portal/rate-limit.ts for what this does and
  // does not promise on serverless.
  const gate = loginAllowed(ip, email)
  if (!gate.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil(gate.retryAfterSeconds / 60)} minutes.` },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSeconds) } },
    )
  }

  const result = verifyFounder(email, body.password ?? '')
  if (!result) {
    recordFailure(ip, email)
    // Deliberately does not say which half was wrong — the addresses that can
    // sign in are on the screen, and confirming one exists is a free hint.
    return NextResponse.json({ error: 'Incorrect email or password' }, { status: 401 })
  }

  recordSuccess(ip, email)
  const res = NextResponse.json({ ok: true, founder: result.founder })
  res.cookies.set(PORTAL_COOKIE, result.token, {
    httpOnly: true,
    sameSite: 'lax',
    // The session is the whole hub — never let it travel in clear. Off in dev so
    // http://localhost still works.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Matched to the token's own lifetime rather than restated, so a cookie can
    // never outlive the token inside it (or vice versa).
    maxAge: PORTAL_SESSION_TTL_MS / 1000,
  })
  return res
}
