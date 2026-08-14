/**
 * Gmail adapter — send through the Google Workspace you already pay for.
 *
 * The alternative to signing up for an email provider. Workspace allows 2,000
 * messages a day per account, which is a very long way past where this business
 * is, and it costs nothing extra because the mailbox already exists.
 *
 * Two decisions here are not obvious and are worth stating.
 *
 * **It uses the Gmail HTTP API, not SMTP.** Vercel blocks outbound port 25
 * outright, and 465/587 from a serverless function is at best unreliable — the
 * usual symptom is the function hanging until it times out, which would mean a
 * payment webhook timing out. HTTPS has none of that problem, so the message is
 * built here and POSTed like any other API call. It also means no `nodemailer`,
 * no connection pooling and no dependency: one POST, the same shape as the
 * Resend adapter next to it.
 *
 * **It authenticates with a refresh token, not a password.** App Passwords are
 * an SMTP-era mechanism, they cannot be scoped, and Google keeps narrowing where
 * they work. A refresh token minted against `gmail.send` can do exactly one
 * thing — send mail as that account — and nothing else in the mailbox. If it
 * leaks, nobody can read a single email with it.
 *
 * ── The one thing to know about the From address ──
 *
 * Gmail will only send as the authenticated account or as an address set up as
 * a **verified send-as alias** on it. Hand it anything else and it quietly
 * substitutes the account's own address rather than failing — so a misconfigured
 * alias looks like success here and only shows up in the recipient's inbox.
 *
 * That is why `GMAIL_SENDER` exists: state the account being authenticated as,
 * and anything that is not a configured alias is rewritten to it deliberately,
 * with a warning in the log, instead of being silently rewritten by Google.
 *
 * Throws on failure. The outbox catches it, records the reason on the row and
 * leaves the notification retryable.
 */
import type { NotificationProvider, RenderedEmail, SendEnvelope, SendResult } from '../types'
import { fromAddress } from '../index'
import { bareAddress } from '../streams'

/**
 * Overridable so the whole path can be pointed at a stub, exactly as the Resend
 * adapter allows. Verifying that a receipt actually leaves the building should
 * not mean emailing a real customer to find out.
 */
function tokenEndpoint(): string {
  return process.env.GMAIL_TOKEN_URL || 'https://oauth2.googleapis.com/token'
}

function sendEndpoint(): string {
  return process.env.GMAIL_API_URL || 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
}

/**
 * The access token, cached until shortly before it expires.
 *
 * Google's tokens last an hour and minting one is a round trip, so caching it
 * saves a request per email. Module scope, which on a serverless platform means
 * per warm instance — a cold start simply mints a new one, which is correct and
 * costs one extra call.
 */
let cachedToken: { value: string; expiresAt: number } | null = null

/** Sixty seconds of headroom, so a token cannot expire mid-flight. */
const EXPIRY_MARGIN_MS = 60_000

function credentials(): { clientId: string; clientSecret: string; refreshToken: string } | null {
  // Falls back to the social-login credentials: it is the same Google Cloud
  // project, and making someone create a second one to email their own
  // customers would be ceremony for its own sake.
  const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) return null
  return { clientId, clientSecret, refreshToken }
}

export function hasGmailCredentials(): boolean {
  return credentials() !== null
}

/** The Workspace account being sent as — the fallback when an alias is wrong. */
export function gmailSender(): string | null {
  const raw = (process.env.GMAIL_SENDER ?? '').trim()
  return raw.length > 0 ? raw : null
}

/**
 * The `send-as` addresses this account may legitimately use.
 *
 * Not discovered from Google, deliberately: the check has to work before the
 * first send, and an extra API call per email to ask a question whose answer
 * changes about once a year is a poor trade. Blank means "trust whatever is
 * asked for", which is the right default for anyone sending from their own
 * address and nothing else.
 */
function allowedSenders(): string[] {
  return (process.env.GMAIL_SEND_AS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

async function accessToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt - EXPIRY_MARGIN_MS > now) return cachedToken.value

  const creds = credentials()
  if (!creds) throw new Error('Gmail is not configured — GMAIL_REFRESH_TOKEN is missing.')

  const res = await fetch(tokenEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    // `invalid_grant` is by far the commonest and means the token was revoked,
    // the Google account's password changed, or the OAuth app is still in
    // "Testing" and the seven-day token lifetime ran out. Worth saying, because
    // the raw error alone sends people looking in the wrong place.
    const hint = detail.includes('invalid_grant')
      ? ' — the refresh token is no longer valid. Reconnect Gmail from Founders Hub → Settings.'
      : ''
    throw new Error(`Google refused the refresh token (${res.status}): ${detail.slice(0, 200)}${hint}`)
  }

  const body = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!body.access_token) throw new Error('Google returned no access token.')

  cachedToken = {
    value: body.access_token,
    expiresAt: now + (body.expires_in ?? 3600) * 1000,
  }
  return cachedToken.value
}

/** Forget the cached token — used when a send is rejected as unauthorised. */
function invalidateToken(): void {
  cachedToken = null
}

// ─── Building the message ────────────────────────────────────────────────────

/**
 * How many BYTES of the original go into one encoded word.
 *
 * Working backwards from the line limit: RFC 5322 wants a header line at 78
 * characters or under, `Subject: ` eats 9 of them, and the `=?UTF-8?B?…?=`
 * wrapper another 12. That leaves 57 for base64, which must be a multiple of 4,
 * so 48 — and 48 base64 characters encode 36 bytes.
 */
const HEADER_CHUNK_BYTES = 36

/**
 * A header value that may contain non-ASCII, per RFC 2047.
 *
 * Subjects here routinely carry `£`, `—` and curly quotes, and a raw 8-bit
 * header is not merely non-compliant — Gmail rejects the message outright.
 *
 * The folding is not optional pedantry: a real subject here ("Your getCHRGD
 * order CHRGD-7K4M2XQP — £72.00") encodes to 86 characters, comfortably past
 * both the 75-character limit RFC 2047 puts on a single encoded word and the
 * 78-character line limit. So it is split into several words, each holding a
 * whole number of characters, joined by a fold — which is CRLF followed by a
 * space, and is how every long header in email has always been wrapped.
 *
 * Splitting on CHARACTER boundaries is the part that matters. Cutting the byte
 * string every 36 bytes would eventually slice a multi-byte character in half
 * and put the pieces in different words, and `£` arrives as a replacement
 * glyph — the exact corruption this function exists to prevent.
 */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(value)) return value

  const words: string[] = []
  let chunk = ''
  let bytes = 0

  for (const character of value) {
    const size = Buffer.byteLength(character, 'utf8')
    if (bytes + size > HEADER_CHUNK_BYTES && chunk.length > 0) {
      words.push(chunk)
      chunk = ''
      bytes = 0
    }
    chunk += character
    bytes += size
  }
  if (chunk.length > 0) words.push(chunk)

  return words.map((word) => `=?UTF-8?B?${Buffer.from(word, 'utf8').toString('base64')}?=`).join('\r\n ')
}

/** `Name <a@b.uk>` with only the display name encoded — the address is ASCII. */
function encodeAddress(value: string): string {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  if (!match) return value.trim()
  const [, name, address] = match
  return name ? `${encodeHeader(name)} <${address}>` : address
}

/** Base64, wrapped at 76 characters as RFC 2045 requires. */
function base64Body(value: string): string {
  return (Buffer.from(value, 'utf8').toString('base64').match(/.{1,76}/g) ?? []).join('\r\n')
}

/**
 * The whole message, as RFC 5322 text.
 *
 * `multipart/alternative` with the plain-text part FIRST — the order is the
 * spec's way of saying "these are increasingly rich versions of one message",
 * and a client that shows the last part it understands would otherwise show the
 * text to everybody.
 */
export function buildMimeMessage(
  to: string,
  email: RenderedEmail,
  envelope: { from: string; replyTo?: string | null },
): string {
  const boundary = `chrgd_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`

  const headers = [
    `From: ${encodeAddress(envelope.from)}`,
    `To: ${to}`,
    ...(envelope.replyTo ? [`Reply-To: ${encodeAddress(envelope.replyTo)}`] : []),
    `Subject: ${encodeHeader(email.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ]

  return [
    ...headers,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(email.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(email.html),
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

/** Gmail wants base64url, unpadded. */
function base64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * The From we are actually allowed to use.
 *
 * Where `GMAIL_SEND_AS` lists the configured aliases, anything outside it is
 * rewritten to the account's own address **and said so in the log**. Google
 * would rewrite it anyway; the difference is that this way somebody finds out.
 */
export function resolveSender(requested: string | undefined): string {
  const wanted = requested || fromAddress()
  const allowed = allowedSenders()
  const sender = gmailSender()

  if (allowed.length === 0 || !sender) return wanted
  if (allowed.includes(bareAddress(wanted).toLowerCase())) return wanted

  console.warn(
    `[notify:gmail] ${bareAddress(wanted)} is not a configured send-as alias — sending as ${sender} instead. ` +
      'Add it in Google Workspace and to GMAIL_SEND_AS, or Google will rewrite it silently.',
  )
  return sender
}

export function createGmailProvider(): NotificationProvider {
  return {
    name: 'gmail',
    async send(to: string, email: RenderedEmail, envelope?: SendEnvelope): Promise<SendResult> {
      const raw = base64Url(
        buildMimeMessage(to, email, {
          from: resolveSender(envelope?.from),
          replyTo: envelope?.replyTo,
        }),
      )

      const res = await fetch(sendEndpoint(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await accessToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
      })

      if (!res.ok) {
        // A 401 means the cached token went stale early — drop it so the retry
        // mints a fresh one rather than replaying the dead one for an hour.
        if (res.status === 401) invalidateToken()
        const detail = await res.text().catch(() => '')
        throw new Error(`Gmail rejected the send (${res.status}): ${detail.slice(0, 300)}`)
      }

      const body = (await res.json().catch(() => ({}))) as { id?: string }
      return { providerId: body.id }
    },
  }
}
