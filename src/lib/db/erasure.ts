/**
 * Getting your data out, and getting rid of it.
 *
 * Articles 15, 17 and 20 in code. Both operations are deliberately explicit
 * about every table rather than leaning on the foreign keys: the cascades are
 * right, but "what happens to a member's data when they leave" is exactly the
 * question you do not want answered by reading DDL in six migrations, and a
 * table added later that nobody wires up here is a silent failure to erase.
 *
 * ── Why erasure anonymises rather than drops the row ────────────────────────
 * Two things must outlive the account, and both are obligations rather than
 * conveniences:
 *
 *   • Orders. HMRC requires six years of them, and an invoice with the customer
 *     scrubbed out is not an invoice. Article 17(3)(b) is the exemption.
 *   • Consent records. They are the evidence of what someone agreed to, which
 *     is the one thing you need if a member later says they never did. Deleting
 *     them the moment a dispute becomes likely is the opposite of a record.
 *
 * `consents.user_id` is ON DELETE CASCADE, so dropping the user row would take
 * the evidence with it. Instead the row is scrubbed to a tombstone — no email,
 * no name, no password, no picture — and everything genuinely personal is
 * deleted outright. Nothing identifying survives, which is what erasure asks
 * for; the tombstone is a key, not a person.
 *
 * Server-only.
 */
import { getEngine, now } from './engine'
import { PLACEHOLDER_EMAIL_DOMAIN } from './migrations'
import { accessesForMember } from '@/lib/portal/access-log'
import type { SqlEngine } from './engine'

/** What a member gets when they ask for their data. */
export interface AccountExport {
  exportedAt: string
  account: unknown
  quiz: unknown
  subscription: unknown
  orders: unknown[]
  consents: unknown[]
  feedback: unknown[]
  shareCards: unknown[]
  emails: unknown[]
  identities: unknown[]
  /**
   * Who at CHRGD has opened this member's record, and when.
   *
   * Included because "who has looked at my data" is a question a subject access
   * request is entitled to an answer to, and answering it out of a log the
   * member cannot see is not much of an answer.
   */
  staffAccess: unknown[]
}

/** Parse a JSON column, keeping the raw text when it will not parse. */
function decode(raw: string | null | undefined): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/**
 * Everything we hold about one member, as a portable document.
 *
 * Article 20 wants a structured, commonly used, machine-readable format, so the
 * stored JSON documents are handed back parsed rather than as escaped strings —
 * a member opening this should see their answers, not a wall of backslashes.
 *
 * Deliberately NOT a `SELECT *` per table: this returns what the member has a
 * right to, and internal columns (password hashes, session tokens, dedupe keys,
 * Stripe ids) are neither useful to them nor safe to hand out.
 */
export async function exportAccount(userId: string): Promise<AccountExport | null> {
  const db = await getEngine()

  const user = await db.get<{
    id: string; email: string; name: string; picture: string | null; created_at: string
  }>('SELECT id, email, name, picture, created_at FROM users WHERE id = ?', [userId])
  if (!user) return null

  const [sub, orders, consents, feedback, cards, emails, identities, accesses] = await Promise.all([
    db.get<{ data: string; quiz: string | null; updated_at: string }>(
      'SELECT data, quiz, updated_at FROM subscriptions WHERE user_id = ?', [userId],
    ),
    db.all<{ data: string; created_at: string }>(
      'SELECT data, created_at FROM orders WHERE user_id = ? ORDER BY created_at', [userId],
    ),
    db.all<{ data: string; context: string; accepted_at: string }>(
      'SELECT data, context, accepted_at FROM consents WHERE user_id = ? ORDER BY accepted_at', [userId],
    ),
    db.all<{ payload: string; created_at: string }>(
      'SELECT payload, created_at FROM feedback WHERE user_id = ? ORDER BY created_at', [userId],
    ),
    db.all<{ token: string; payload: string; created_at: string; view_count: number }>(
      'SELECT token, payload, created_at, view_count FROM share_cards WHERE user_id = ? ORDER BY created_at', [userId],
    ),
    // The template and when it went out, not the rendered body — that is our
    // copy of a message they already received, and it is being deleted on a
    // window anyway.
    db.all<{ template: string; created_at: string; sent_at: string | null }>(
      'SELECT template, created_at, sent_at FROM notifications WHERE user_id = ? ORDER BY created_at', [userId],
    ),
    db.all<{ provider: string; created_at: string }>(
      'SELECT provider, created_at FROM identities WHERE user_id = ? ORDER BY created_at', [userId],
    ),
    // Which member of staff, by name, is deliberately not included: it answers
    // the member's question ("has anyone looked?") without publishing an
    // employee's activity to a customer. The named log is kept internally.
    accessesForMember(userId),
  ])

  return {
    exportedAt: now(),
    account: {
      email: user.email,
      name: user.name,
      picture: user.picture,
      joined: user.created_at,
    },
    quiz: decode(sub?.quiz),
    subscription: sub ? { ...(decode(sub.data) as object), updatedAt: sub.updated_at } : null,
    orders: orders.map((o) => decode(o.data)),
    consents: consents.map((c) => decode(c.data)),
    feedback: feedback.map((f) => decode(f.payload)),
    shareCards: cards.map((c) => ({
      token: c.token,
      createdAt: c.created_at,
      views: c.view_count,
      card: decode(c.payload),
    })),
    emails: emails.map((e) => ({ template: e.template, queuedAt: e.created_at, sentAt: e.sent_at })),
    identities: identities.map((i) => ({ provider: i.provider, linkedAt: i.created_at })),
    staffAccess: accesses.map((a) => ({ at: a.at, what: a.kind })),
  }
}

export interface DeletionResult {
  /** Tables the member's rows were removed from, for the confirmation and the log. */
  deleted: string[]
  /** Rows kept because the law requires them, with the reason. */
  retained: { what: string; why: string }[]
}

/**
 * Erase an account.
 *
 * Ordered so that nothing can leave a member half-deleted in a way that still
 * works: sessions go first, so an erasure that fails partway through has at
 * least signed them out rather than leaving a live session over a stripped
 * account.
 *
 * Idempotent — every statement is a DELETE or an UPDATE by user id, so running
 * it twice is harmless. That matters because the route retries on a timeout and
 * a member pressing the button twice must not see an error.
 */
export async function deleteAccount(userId: string): Promise<DeletionResult> {
  const db = await getEngine()
  const deleted: string[] = []

  const drop = async (table: string, sql: string) => {
    await db.run(sql, [userId])
    deleted.push(table)
  }

  // Access first — see above.
  await drop('sessions', 'DELETE FROM sessions WHERE user_id = ?')
  await drop('password_resets', 'DELETE FROM password_resets WHERE user_id = ?')
  await drop('identities', 'DELETE FROM identities WHERE user_id = ?')

  // The health data and the plan.
  await drop('subscriptions', 'DELETE FROM subscriptions WHERE user_id = ?')
  await drop('feedback', 'DELETE FROM feedback WHERE user_id = ?')
  await drop('subscription_changes', 'DELETE FROM subscription_changes WHERE user_id = ?')
  await drop('stock_exceptions', 'DELETE FROM stock_exceptions WHERE user_id = ?')

  // Public cards. Deleted rather than revoked: a revoked card stops rendering
  // but the payload — their stack, sometimes their first name — stays on disk,
  // and an erasure that leaves the shareable artefact behind is not one.
  await drop('share_cards', 'DELETE FROM share_cards WHERE user_id = ?')

  // Emails keep their audit trail (that a receipt was sent, and when) but lose
  // the recipient and the rendered body.
  await db.run(
    `UPDATE notifications SET user_id = NULL, email = NULL, data = ?, updated_at = ?
     WHERE user_id = ?`,
    [JSON.stringify({ erased: true }), now(), userId],
  )
  deleted.push('notifications (recipient and body)')

  await anonymiseUser(db, userId)
  deleted.push('users (anonymised)')

  return {
    deleted,
    retained: [
      {
        what: 'Orders and invoices',
        why: 'HMRC requires business records to be kept for six years (UK GDPR Article 17(3)(b) — a legal obligation).',
      },
      {
        what: 'Consent records',
        why: 'Evidence of what you agreed to and when. Kept for the establishment and defence of legal claims (Article 17(3)(e)).',
      },
    ],
  }
}

/**
 * Scrub the user row to a tombstone.
 *
 * The email becomes a unique non-routable address rather than NULL, because the
 * column is NOT NULL and UNIQUE — two erased accounts would collide on an empty
 * string, and the second erasure would fail. `.invalid` is reserved by RFC 2606
 * and can never be delivered to or mistaken for real, and `hasRealEmail` already
 * treats that domain as "no email on file" everywhere in the app.
 *
 * The password hash goes to NULL, which is what closes the account: the login
 * path has no branch that authenticates against a null hash, so the tombstone
 * cannot be signed into even by someone who knows the old password.
 */
async function anonymiseUser(db: SqlEngine, userId: string): Promise<void> {
  await db.run(
    `UPDATE users SET email = ?, name = ?, password_hash = NULL, google_sub = NULL, picture = NULL
     WHERE id = ?`,
    [`erased-${userId}@${PLACEHOLDER_EMAIL_DOMAIN}`, 'Deleted account', userId],
  )
}

/** Whether this account has already been erased. */
export async function isErased(userId: string): Promise<boolean> {
  const db = await getEngine()
  const row = await db.get<{ email: string }>('SELECT email FROM users WHERE id = ?', [userId])
  return !!row?.email.startsWith('erased-')
}
