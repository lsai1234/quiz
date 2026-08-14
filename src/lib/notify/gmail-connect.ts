/**
 * Shared constants for the Gmail connect flow.
 *
 * Its own module because a Next.js `route.ts` may export the HTTP method
 * handlers and nothing else — an extra export is a build error, not a style
 * preference — and the two halves of an OAuth round trip necessarily agree
 * about the redirect URI and the state cookie.
 */
export const GMAIL_OAUTH_STATE_COOKIE = 'gmail_connect_state'

/**
 * Send-only. Deliberately not `gmail.compose` or `gmail.modify`: a token minted
 * with this can send mail as the account and cannot read a single message in
 * the mailbox, which is the whole blast radius if it ever leaks.
 */
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send email'

/** Must match the Authorised redirect URI registered in Google Cloud. */
export function gmailRedirectUri(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/api/portal/gmail-connect/callback`
}

/** The OAuth client, falling back to the pair the social login already uses. */
export function gmailOAuthClient(): { id: string; secret: string } | null {
  const id = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID
  const secret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET
  return id && secret ? { id, secret } : null
}
