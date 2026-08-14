/**
 * Google comes back here with a code; this turns it into a refresh token and
 * prints it, along with the three lines to paste into Vercel.
 *
 * Answers with a page rather than JSON because the reader is a person who has
 * just clicked through a Google consent screen, and because the value of this
 * route is entirely in telling them what to do with what it produces.
 *
 * The token is displayed once and never written down anywhere by us. That is a
 * deliberate trade: a secret in Vercel's environment variables sits with the
 * Stripe keys and the database URL, which is where secrets belong, rather than
 * in an application table that would then need encrypting and rotating.
 */
import { cookies } from 'next/headers'
import { isPortalAuthed } from '@/lib/portal/guard'
import { decodeJwtPayload } from '@/lib/auth/providers/common'
import { ACCENT } from '@/lib/ui/tokens'
import { GMAIL_OAUTH_STATE_COOKIE, gmailOAuthClient, gmailRedirectUri } from '@/lib/notify/gmail-connect'

export const dynamic = 'force-dynamic'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function page(title: string, body: string): Response {
  return new Response(
    `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>${escapeHtml(title)} · Founders Hub</title>
</head>
<body style="margin:0;background:#0a0a0c;color:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:680px;margin:0 auto;padding:64px 24px">
    <div style="font-size:18px;font-weight:800;letter-spacing:-0.02em;padding-bottom:32px">CHRGD <span style="color:${ACCENT}">Founders Hub</span></div>
    <h1 style="font-size:26px;font-weight:800;line-height:1.25;margin:0 0 20px">${escapeHtml(title)}</h1>
    ${body}
    <p style="font-size:13px;margin:32px 0 0"><a href="/founderhub/emails" style="color:${ACCENT}">Back to Emails</a></p>
  </div>
</body>
</html>`,
    {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // The page contains a live credential. It must not sit in a cache.
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  )
}

function problem(message: string): Response {
  return page(
    'That did not work',
    `<p style="font-size:15px;line-height:1.7;color:#a1a1aa;margin:0 0 20px">${escapeHtml(message)}</p>
     <p style="font-size:15px;line-height:1.7;color:#a1a1aa;margin:0"><a href="/api/portal/gmail-connect" style="color:${ACCENT}">Try again</a></p>`,
  )
}

export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return new Response('Unauthorized', { status: 401 })

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) return problem(`Google said: ${error}. Nothing has changed.`)
  if (!code) return problem('Google did not send an authorisation code back.')

  // CSRF: the state we set on the way out has to be the state coming back, or
  // this is somebody else's authorisation being fed to your hub.
  const jar = await cookies()
  const expected = jar.get(GMAIL_OAUTH_STATE_COOKIE)?.value
  if (!expected || expected !== state) {
    return problem('That link has expired or was not started from this page. Start again from Founders Hub → Emails.')
  }

  const client = gmailOAuthClient()
  if (!client) return problem('No Google client ID and secret are configured.')

  const origin = process.env.APP_URL || url.origin
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.id,
      client_secret: client.secret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: gmailRedirectUri(origin),
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return problem(`Google refused the exchange (${res.status}). ${detail.slice(0, 300)}`)
  }

  const body = (await res.json()) as { refresh_token?: string; id_token?: string }

  if (!body.refresh_token) {
    // Google issues a refresh token only on the FIRST authorisation unless it is
    // explicitly asked to re-consent. The outbound leg does ask, so reaching
    // this means something stripped it — worth saying exactly what to do.
    return problem(
      'Google returned an access token but no refresh token. That happens when this app has been authorised before. ' +
        'Remove it at myaccount.google.com/permissions and connect again.',
    )
  }

  const account = decodeJwtPayload<{ email?: string }>(body.id_token ?? '')?.email ?? null

  const rows = [
    ['NOTIFY_SOURCE', 'gmail'],
    ['GMAIL_REFRESH_TOKEN', body.refresh_token],
    ...(account ? [['GMAIL_SENDER', account]] : []),
  ]
    .map(
      ([name, value]) =>
        `<tr>
          <td style="padding:10px 14px;border-bottom:1px solid #27272a;font-family:ui-monospace,monospace;font-size:13px;color:${ACCENT};white-space:nowrap;vertical-align:top">${escapeHtml(name)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #27272a;font-family:ui-monospace,monospace;font-size:13px;word-break:break-all">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join('')

  const response = page(
    account ? `Connected ${account}` : 'Connected',
    `<p style="font-size:15px;line-height:1.7;color:#a1a1aa;margin:0 0 24px">
      Add these to your project in Vercel — <strong style="color:#fafafa">Settings → Environment Variables</strong> — then redeploy.
      This is the only time the token is shown; it is not stored anywhere by the site.
    </p>
    <table style="width:100%;border-collapse:collapse;background:#141418;border-radius:12px;overflow:hidden;margin-bottom:24px">${rows}</table>
    <p style="font-size:13px;line-height:1.7;color:#71717a;margin:0 0 12px">
      This token can send email as ${escapeHtml(account ?? 'that account')} and can do nothing else — it cannot read the mailbox.
      Revoke it any time at <span style="color:#a1a1aa">myaccount.google.com/permissions</span>.
    </p>
    <p style="font-size:13px;line-height:1.7;color:#71717a;margin:0">
      Once redeployed, open Founders Hub → Emails and use <strong style="color:#a1a1aa">Send me a copy</strong> on any email to check it arrives — and check who it says it is from.
    </p>`,
  )
  response.headers.append(
    'Set-Cookie',
    `${GMAIL_OAUTH_STATE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
  )
  return response
}
