/**
 * Turning off the promotional strip in member emails.
 *
 * Reached from the footer of every email that carries one. Three things about
 * its shape are deliberate:
 *
 *  1. **It answers with a page, not JSON.** A link in an email is clicked by a
 *     person in a mail client, and landing them on `{"ok":true}` is not an
 *     answer to "have you stopped?".
 *  2. **The GET does the work.** A one-click opt-out is the standard every
 *     mailbox provider expects, and putting a form in the way of someone who has
 *     already said no is the behaviour that earns a spam report instead. Nothing
 *     destructive happens: the only effect is that we say less to them.
 *  3. **It says plainly what has NOT stopped.** Receipts, price-change notices
 *     and failed-payment emails carry on, because they are the service and not
 *     marketing — and a member who thinks they have switched off their receipts
 *     will be back in the support inbox within the month.
 *
 * The token is the only credential. It is unguessable and minted per address,
 * so a bad one is simply not honoured — and the page says the same thing either
 * way rather than confirming whether an address is on our list.
 */
import { emailForOptOutToken, resumeMarketing, suppressMarketing } from '@/lib/notify/marketing'
import { ACCENT } from '@/lib/ui/tokens'

export const dynamic = 'force-dynamic'

function page(title: string, body: string, action?: { label: string; href: string }): Response {
  const html = `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>${title} · getCHRGD</title>
</head>
<body style="margin:0;background:#0a0a0c;color:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:80px 24px">
    <div style="font-size:22px;font-weight:800;letter-spacing:-0.02em;padding-bottom:32px">get<span style="color:${ACCENT}">CHRGD</span></div>
    <h1 style="font-size:26px;font-weight:800;line-height:1.25;margin:0 0 16px">${title}</h1>
    <p style="font-size:15px;line-height:1.7;color:#a1a1aa;margin:0 0 24px">${body}</p>
    ${
      action
        ? `<p style="margin:0 0 24px"><a href="${action.href}" style="display:inline-block;background:${ACCENT};color:#001018;font-weight:700;font-size:14px;text-decoration:none;padding:13px 24px;border-radius:12px">${action.label}</a></p>`
        : ''
    }
    <p style="font-size:13px;line-height:1.7;color:#71717a;margin:0"><a href="/" style="color:#71717a">Back to getCHRGD</a></p>
  </div>
</body>
</html>`
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const token = params.get('t') ?? ''
  const email = await emailForOptOutToken(token)

  if (!email) {
    // Same answer for an expired link and a made-up one — a different message
    // for each would turn this into a way of testing whether an address is ours.
    return page(
      'That link has expired',
      'We could not match this link to an email address. Nothing has changed. If you would rather not hear from us, reply to any email we have sent you and we will sort it out.',
    )
  }

  // `?resume=1` is the undo, offered on the confirmation below for a mis-click.
  if (params.get('resume') === '1') {
    await resumeMarketing(email)
    return page(
      'Turned back on',
      `You will see our news and offers at the foot of emails to ${email} again.`,
    )
  }

  await suppressMarketing(email)
  return page(
    'Done — no more promotions',
    `We have turned off the news and offers at the foot of emails to ${email}. You will still get the emails that are part of the service: your order receipts, your subscription receipts, anything that changes on your plan, price-change notices and anything to do with a payment. Those are the record of what you have bought, so we cannot stop sending them.`,
    { label: 'Actually, turn it back on', href: `/api/notify/marketing-opt-out?t=${encodeURIComponent(token)}&resume=1` },
  )
}
