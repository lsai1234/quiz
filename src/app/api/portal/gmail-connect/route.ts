/**
 * Connecting a Google Workspace mailbox, from inside the Founders Hub.
 *
 * Sending through Workspace needs an OAuth **refresh token**, and getting one is
 * the single step that stops a non-developer setting this up. The documented
 * alternatives are pasting client secrets into Google's OAuth Playground or
 * running a script from a terminal — both are error-prone, and one of them ends
 * with your production secret in a third-party web tool.
 *
 * So the hub does the round trip itself: press the button, pick the mailbox,
 * copy the token it prints into Vercel. That is the whole procedure.
 *
 * Three things about how it is scoped:
 *
 *  • **`gmail.send` and nothing else.** The narrowest scope Google publishes for
 *    this. A token minted here can send mail as that account and cannot read a
 *    single message in the mailbox, list threads, or touch contacts. If it ever
 *    leaks, that is the whole blast radius.
 *  • **Behind the founder password**, like every other portal route. Anyone who
 *    can reach it can already change the prices.
 *  • **The token is shown, not stored.** It goes into Vercel's environment
 *    variables where the rest of the secrets live, rather than into a database
 *    row that would then need encrypting, rotating and backing up.
 */
import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { randomToken } from '@/lib/auth/providers/common'
import {
  GMAIL_OAUTH_STATE_COOKIE,
  GMAIL_SCOPE,
  gmailOAuthClient,
  gmailRedirectUri,
} from '@/lib/notify/gmail-connect'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const client = gmailOAuthClient()
  if (!client) {
    return NextResponse.json(
      {
        error:
          'No Google client ID is configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (the same pair the social login uses), then try again.',
      },
      { status: 400 },
    )
  }

  const origin = process.env.APP_URL || new URL(req.url).origin
  const state = randomToken()

  const params = new URLSearchParams({
    client_id: client.id,
    redirect_uri: gmailRedirectUri(origin),
    response_type: 'code',
    scope: GMAIL_SCOPE,
    state,
    // `offline` is what makes Google issue a refresh token at all, and `consent`
    // forces it to issue a NEW one. Without the second, Google returns only an
    // access token on every authorisation after the first — which is the reason
    // this step so often appears to work and produces nothing usable.
    access_type: 'offline',
    prompt: 'consent',
    // Pre-fills the account picker, so a founder with a personal Gmail signed in
    // does not accidentally connect the wrong mailbox.
    ...(process.env.GMAIL_SENDER ? { login_hint: process.env.GMAIL_SENDER } : {}),
  })

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
  response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return response
}
