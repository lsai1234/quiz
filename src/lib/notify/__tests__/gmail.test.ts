/**
 * Sending through Google Workspace.
 *
 * The assertions worth having are about the message being *well formed*: Gmail
 * rejects a malformed MIME body outright, and the failure modes that get through
 * — a mangled £ sign, a subject that arrives as `=?UTF-8?` gibberish, an HTML
 * part shown as source — are all invisible until a customer sees them.
 */
import { buildMimeMessage, resolveSender } from '@/lib/notify/providers/gmail'
import type { RenderedEmail } from '@/lib/notify/types'

const ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ENV }
  jest.restoreAllMocks()
})

const email: RenderedEmail = {
  subject: 'Your getCHRGD order CHRGD-7K4M2XQP — £72.00',
  text: 'Total paid £72.00',
  html: '<p>Total paid £72.00</p>',
}

function message(over: Partial<Parameters<typeof buildMimeMessage>[2]> = {}): string {
  return buildMimeMessage('buyer@example.com', email, {
    from: 'getCHRGD Orders <orderconfirmation.noreply@getchrgd.co.uk>',
    replyTo: 'contact@getchrgd.co.uk',
    ...over,
  })
}

/**
 * Read one header back the way a mail client would: unfold the continuation
 * lines, then decode every RFC 2047 word in it.
 */
function header(raw: string, name: string): string {
  const lines = raw.split('\r\n')
  const start = lines.findIndex((line) => line.startsWith(`${name}: `))
  if (start === -1) return ''

  let value = lines[start].slice(name.length + 2)
  // A folded header continues on any following line that begins with whitespace.
  for (let i = start + 1; i < lines.length && /^[ \t]/.test(lines[i]); i++) {
    value += lines[i].slice(1)
  }

  return value.replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_, encoded: string) =>
    Buffer.from(encoded, 'base64').toString('utf8'),
  )
}

/** Pull a decoded part out of the multipart body, by its content type. */
function part(raw: string, contentType: string): string {
  const section = raw.split(/--chrgd_[a-z0-9]+/).find((s) => s.includes(contentType)) ?? ''
  const body = section.split('\r\n\r\n').slice(1).join('\r\n\r\n').trim()
  return Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8')
}

describe('the message Gmail is handed', () => {
  it('uses CRLF line endings, which the mail format requires', () => {
    // Bare newlines are the classic cause of "Gmail says 400 and won't say why".
    const raw = message()
    expect(raw).toContain('\r\n')
    expect(raw.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('carries the headers a recipient acts on', () => {
    const raw = message()
    expect(raw).toContain('To: buyer@example.com')
    expect(raw).toContain('MIME-Version: 1.0')
    expect(raw).toContain('Content-Type: multipart/alternative;')
    // The reply path is the entire justification for a noreply sender.
    expect(raw).toContain('Reply-To: contact@getchrgd.co.uk')
  })

  it('encodes a subject containing a pound sign, and it survives the round trip', () => {
    // A raw 8-bit header is not merely non-compliant — Gmail refuses the message.
    const raw = message()
    expect(raw).toContain('Subject: =?UTF-8?B?')
    // Nothing 8-bit anywhere in the headers.
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(raw.split('\r\n\r\n')[0])).toBe(false)
    // And it comes back out exactly as it went in, folds and all.
    expect(header(raw, 'Subject')).toBe(email.subject)
  })

  it('does not slice a multi-byte character across two encoded words', () => {
    /**
     * The failure this guards against is silent and specific: chop the byte
     * string every N bytes and you eventually cut a `£` or an em dash in half,
     * put the pieces in separate words, and the customer gets a replacement
     * glyph in their subject line. Long enough to force several folds, and
     * every character multi-byte.
     */
    const awkward = { ...email, subject: `£72.00 — ${'—£€'.repeat(20)}` }
    const raw = buildMimeMessage('a@b.com', awkward, { from: 'x@y.uk' })

    expect(header(raw, 'Subject')).toBe(awkward.subject)
    expect(header(raw, 'Subject')).not.toContain('�')
  })

  it('leaves a plain ASCII subject alone, rather than encoding it for no reason', () => {
    const raw = buildMimeMessage('a@b.com', { ...email, subject: 'Your order is confirmed' }, { from: 'x@y.uk' })
    expect(raw).toContain('Subject: Your order is confirmed')
  })

  it('sends both bodies, intact', () => {
    const raw = message()
    expect(part(raw, 'text/plain')).toBe(email.text)
    expect(part(raw, 'text/html')).toBe(email.html)
  })

  it('puts the plain text part first, so a client picking the last one gets the HTML', () => {
    // `multipart/alternative` means "increasingly rich versions of one message",
    // and the order is how that is expressed. Backwards, everyone reads the text.
    const raw = message()
    expect(raw.indexOf('text/plain')).toBeLessThan(raw.indexOf('text/html'))
  })

  it('wraps the encoded body, because 76 characters is the line limit', () => {
    const long = { ...email, html: `<p>${'x'.repeat(5000)}</p>` }
    const raw = buildMimeMessage('a@b.com', long, { from: 'x@y.uk' })
    const overLong = raw.split('\r\n').filter((line) => line.length > 78)
    expect(overLong).toEqual([])
  })

  it('omits Reply-To rather than sending an empty one', () => {
    expect(message({ replyTo: null })).not.toContain('Reply-To:')
  })
})

describe('which address it may actually send as', () => {
  it('sends as asked when no alias list is configured', () => {
    // The common case: one mailbox, sending as itself, nothing to police.
    delete process.env.GMAIL_SEND_AS
    process.env.GMAIL_SENDER = 'contact@getchrgd.co.uk'
    expect(resolveSender('CHRGD <contact@getchrgd.co.uk>')).toBe('CHRGD <contact@getchrgd.co.uk>')
  })

  it('sends as a listed alias', () => {
    process.env.GMAIL_SENDER = 'contact@getchrgd.co.uk'
    process.env.GMAIL_SEND_AS = 'orderconfirmation.noreply@getchrgd.co.uk, billing.noreply@getchrgd.co.uk'
    expect(resolveSender('getCHRGD Orders <orderconfirmation.noreply@getchrgd.co.uk>')).toContain(
      'orderconfirmation.noreply@getchrgd.co.uk',
    )
  })

  it('falls back to the account, loudly, for an address Google would reject', () => {
    /**
     * Gmail silently substitutes the authenticated account for an unverified
     * send-as address rather than failing. So a mis-typed alias looks like a
     * success here and only shows up in the customer's inbox — which is exactly
     * the kind of thing nobody finds for a month. Say it out loud instead.
     */
    process.env.GMAIL_SENDER = 'contact@getchrgd.co.uk'
    process.env.GMAIL_SEND_AS = 'orderconfirmation.noreply@getchrgd.co.uk'
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    expect(resolveSender('getCHRGD Billing <billing.noreply@getchrgd.co.uk>')).toBe('contact@getchrgd.co.uk')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('billing.noreply@getchrgd.co.uk'))
  })

  it('is case-insensitive about the alias, because email addresses are', () => {
    process.env.GMAIL_SENDER = 'contact@getchrgd.co.uk'
    process.env.GMAIL_SEND_AS = 'OrderConfirmation.NoReply@GetCHRGD.co.uk'
    expect(resolveSender('Orders <orderconfirmation.noreply@getchrgd.co.uk>')).toContain('orderconfirmation.noreply')
  })
})
