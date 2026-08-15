/**
 * Account emails — getting back in, and being told when someone did.
 *
 * The fourth kind of notification, alongside `commerce.ts` (you bought
 * something), `from-change.ts` (we changed your plan) and `billing.ts` (Stripe
 * told us something). What makes this one different is that its email carries a
 * **credential**, and that changes two rules the rest of the system lives by.
 *
 * ── 1. It does not go in the outbox ──────────────────────────────────────────
 * Every other email is queued, stored and then sent, so a failure is visible and
 * retryable. A reset link stored that way is an account takeover sitting in an
 * admin page and in every database backup: anyone who can read the Founders Hub
 * email log could click it and become that customer. So the link is rendered,
 * sent and forgotten inside one call, and the row left behind is an audit record
 * — who asked, when, and whether it left — carrying a copy of the email with the
 * link replaced. `recordDirectSend` documents the seam.
 *
 * That audit copy is not a lie by omission: it says on its face that the link
 * isn't kept, and its button goes to the page that issues a fresh one. If a
 * founder ever re-sends it by hand, the member gets something that works.
 *
 * ── 2. It ignores the auto-send policy ───────────────────────────────────────
 * `NOTIFY_AUTO_SEND` exists so that emails with judgement in them wait for a
 * person. There is no judgement in a reset link and nobody to exercise it: the
 * member is locked out, watching an inbox, right now. It sends whenever a
 * provider exists, and when one does not it reports that plainly rather than
 * queueing something nobody will ever receive — which is why the sign-in screens
 * hide the "forgot password" link until one is configured.
 *
 * Server-only.
 */
import { randomUUID } from 'crypto'
import { appBaseUrl, canSendFromHub, getNotifier } from './index'
import { fromAddressFor, replyToAddress } from './streams'
import { queueNotification, recordDirectSend } from './outbox'
import { passwordChanged, passwordReset } from './templates'
import type { RenderedEmail } from './types'

/** Where a reset link is not kept, the audit copy points instead. */
function forgotPasswordUrl(base: string, realm: 'account' | 'partner'): string {
  return realm === 'partner' ? `${base}/partner` : `${base}/myhub?forgot=1`
}

/**
 * The address a member can complain to, when one is configured.
 *
 * Same guard the mail streams use: the legal-entity settings carry `[bracketed]`
 * placeholders meaning "not filled in yet", and one of those is not an address
 * to tell someone to write to.
 */
function supportEmail(): string | null {
  const raw = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? '').trim()
  return raw && !raw.startsWith('[') && raw.includes('@') ? raw : null
}

export interface PasswordResetEmail {
  /** Null for a partner — they are not a row in `users`. */
  userId: string | null
  email: string
  firstName?: string | null
  /** The one-time link, already absolute. */
  resetUrl: string
  /** How long it lasts, in words. */
  expiresIn: string
  realm?: 'account' | 'partner'
}

/**
 * Send a reset link now.
 *
 * Returns whether it actually left. The caller does NOT pass that back to the
 * browser — every request answers the same way regardless — but a false is worth
 * logging, because "the reset emails stopped working" is otherwise invisible
 * until somebody phones up.
 *
 * Never throws: a locked-out member and a mail provider having a bad afternoon
 * are two problems, and the second must not turn the first into a 500.
 */
export async function sendPasswordReset(input: PasswordResetEmail): Promise<boolean> {
  if (!canSendFromHub()) return false

  const realm = input.realm ?? 'account'
  const base = appBaseUrl()

  try {
    // Two renders of one email: the one that goes, and the one we keep.
    const context = {
      firstName: input.firstName ?? null,
      expiresIn: input.expiresIn,
      realm,
    }
    const live = passwordReset({ ...context, resetUrl: input.resetUrl }, { baseUrl: base })
    const stored = redacted(
      passwordReset({ ...context, resetUrl: forgotPasswordUrl(base, realm) }, { baseUrl: base }),
    )

    const row = await queueNotification({
      userId: input.userId,
      email: input.email,
      template: 'password-reset',
      // Never deduped against anything: asking twice must send twice, or the
      // second attempt by someone who deleted the first email does nothing.
      dedupeKey: `password-reset:${randomUUID()}`,
      rendered: stored,
    })

    try {
      const notifier = await getNotifier()
      const { providerId } = await notifier.send(input.email, live, {
        from: fromAddressFor('account'),
        replyTo: replyToAddress(),
      })
      await recordDirectSend(row.id, { providerId })
      return true
    } catch (err) {
      await recordDirectSend(row.id, { error: err instanceof Error ? err.message : String(err) })
      console.error('[notify] password reset could not be sent:', err)
      return false
    }
  } catch (err) {
    console.error('[notify] password reset could not be prepared:', err)
    return false
  }
}

/** The banner the stored copy carries in place of the link. */
const REDACTION =
  'The one-time link this email carried is not kept on file — the button below asks for a fresh one instead.'

/**
 * Mark a rendered email as the copy that was kept rather than the one that was
 * sent. Stated in both bodies, because a plain-text-only client reading an
 * audit copy deserves to know it is looking at one too.
 */
function redacted(email: RenderedEmail): RenderedEmail {
  return {
    subject: email.subject,
    text: `[${REDACTION}]\n\n${email.text}`,
    html: `<p style="font-family:system-ui,sans-serif;font-size:12px;line-height:1.6;color:#6b7280;padding:0 0 12px">${REDACTION}</p>${email.html}`,
  }
}

/**
 * Tell someone their password changed.
 *
 * Goes through the outbox normally — it carries no credential, and there is
 * nothing in it worth withholding. Sent immediately for the same reason a
 * receipt is: it is only useful in the minutes after the event.
 *
 * Never throws. The password has already been changed by the time this is
 * reached, and failing the request now would tell the member their reset didn't
 * work when it did.
 */
export async function sendPasswordChanged(input: {
  userId: string | null
  email: string
  firstName?: string | null
}): Promise<void> {
  try {
    if (!canSendFromHub()) return
    const base = appBaseUrl()
    const rendered = passwordChanged(
      {
        signInUrl: `${base}/myhub`,
        firstName: input.firstName ?? null,
        supportEmail: supportEmail(),
      },
      { baseUrl: base },
    )

    const row = await queueNotification({
      userId: input.userId,
      email: input.email,
      template: 'password-changed',
      dedupeKey: `password-changed:${randomUUID()}`,
      rendered,
    })

    try {
      const notifier = await getNotifier()
      const { providerId } = await notifier.send(input.email, rendered, {
        from: fromAddressFor('account'),
        replyTo: replyToAddress(),
      })
      await recordDirectSend(row.id, { providerId })
    } catch (err) {
      await recordDirectSend(row.id, { error: err instanceof Error ? err.message : String(err) })
    }
  } catch (err) {
    console.error('[notify] password-changed notice could not be sent:', err)
  }
}
