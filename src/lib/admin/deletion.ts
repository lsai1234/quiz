/**
 * Deleting things for good.
 *
 * ── Why this exists next to `lib/db/erasure` ────────────────────────────────
 * That module answers a member exercising Article 17: it ANONYMISES, because
 * orders and consents have to outlive the account. This one answers a founder
 * clearing up their own hub — a test partner whose email they want back, an
 * order they will not send and do not want in the numbers — and for that,
 * anonymising is the wrong answer. A tombstone still holds the email against
 * the unique index, and a rejected order still sits in the totals.
 *
 * ── What makes an irreversible button safe ──────────────────────────────────
 * Three things, and all three are here rather than in the screen that calls it:
 *
 *  1. **It refuses when the record is not ours to destroy.** Money that has
 *     actually moved, and parcels that are already with the supplier, are facts
 *     about the outside world. Deleting our row does not un-charge a card or
 *     un-ship a box; it only means we can no longer see what happened.
 *  2. **It names every table.** Foreign keys would cascade most of this, and
 *     the cascades are right — but "what goes when a partner goes" is exactly
 *     the question you do not want answered by reading DDL across six
 *     migrations, and a table added later that nobody wires up here is a silent
 *     failure to delete. Same reasoning as `erasure.ts`.
 *  3. **It leaves a tombstone.** Not a copy — a description. See `deletion_log`
 *     in migration v21.
 *
 * ── What it deliberately does NOT do ────────────────────────────────────────
 * Un-spend anything by accident. An order deleted after a partner claimed their
 * free stack with it gives the STARTER back, because the alternative is a
 * partner who has signed an agreement, taken their one stack, and has nothing
 * to show for it because we tidied up our own test order.
 *
 * Server-only.
 */
import crypto from 'crypto'
import { getEngine, now } from '@/lib/db/engine'
import { getOrder } from '@/lib/orders/repo'
import { getPartner } from '@/lib/partners/repo'
import { listCommissions } from '@/lib/partners/repo'

export type DeletionKind = 'partner' | 'order'

export interface DeletionCheck {
  /** Whether it can be deleted at all. */
  ok: boolean
  /** Why not, in a sentence a founder can act on. Empty when `ok`. */
  reason?: string
  /** What will go, for a confirm step that means something. */
  summary: string
  /** Extra consequences worth saying out loud before the click. */
  effects: string[]
}

async function log(input: {
  kind: DeletionKind
  subjectId: string
  founder?: string | null
  reason?: string | null
  summary: string
}): Promise<void> {
  const db = await getEngine()
  try {
    await db.run(
      `INSERT INTO deletion_log (id, kind, subject_id, founder, reason, summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        input.kind,
        input.subjectId,
        input.founder ?? null,
        input.reason?.trim() || null,
        input.summary,
        now(),
      ],
    )
  } catch (err) {
    // Never fail the deletion over its own audit row — the same rule the access
    // log follows. A founder who pressed delete and got an error would press it
    // again, and the second press would find nothing there.
    console.error('[deletion] could not write the tombstone:', err)
  }
}

// ─── Partners ────────────────────────────────────────────────────────────────

/**
 * Whether this partner can be removed outright, and what goes with them.
 *
 * The line is money. A partner who has been PAID, or who has an invoice raised
 * against them, is in the books — and our own agreement tells them we keep
 * those for six years. Suspending stops their code; deleting would destroy the
 * record of what we owed and paid, which is not a tidy-up.
 *
 * Everything short of that — a partner who never signed in, never posted, or
 * accrued something that was later reversed — is ours to remove, and the email
 * goes back into circulation with them.
 */
export async function checkPartnerDeletion(id: string): Promise<DeletionCheck> {
  const partner = await getPartner(id)
  if (!partner) return { ok: false, reason: 'No such partner.', summary: '', effects: [] }

  const summary = `${partner.name} <${partner.email}>`
  const commissions = await listCommissions(id).catch(() => [])
  const settled = commissions.filter((c) => c.state === 'paid' || c.state === 'invoiced')

  if (settled.length > 0) {
    const total = settled.reduce((s, c) => s + c.amount, 0)
    return {
      ok: false,
      summary,
      effects: [],
      reason:
        `This partner has £${total.toFixed(2)} of commission invoiced or paid, and those are accounts — ` +
        'we told them in their agreement that we keep them for six years. Suspend them instead; their code ' +
        'stops working immediately either way.',
    }
  }

  const effects = ['Their email goes back into circulation, so it can be used for a new partner.']
  if (commissions.length > 0) {
    effects.push(`${commissions.length} unsettled commission row${commissions.length === 1 ? '' : 's'} go too.`)
  }
  return { ok: true, summary, effects }
}

/**
 * Remove a partner and everything of theirs.
 *
 * Every table by name. The foreign keys would cascade most of it, and two would
 * not: `partner_starters` and `partner_agreements` were deliberately written
 * without a reference to `partners` — the agreement so that deleting a partner
 * could never destroy the record of what they had agreed to.
 *
 * That rule is right where a partner has traded, and this path cannot be
 * reached where they have (see `checkPartnerDeletion`). For a partner who never
 * did, the agreement is personal data about somebody we are erasing, and
 * keeping it would be a record of a person we no longer hold — so it goes.
 */
export async function deletePartner(
  id: string,
  opts: { by?: string | null; reason?: string | null } = {},
): Promise<DeletionCheck> {
  const check = await checkPartnerDeletion(id)
  if (!check.ok) return check

  const db = await getEngine()
  // Order matters only for readability — nothing here references anything else
  // here — but it reads as: their access, their instruments, their money.
  for (const sql of [
    'DELETE FROM partner_sessions WHERE partner_id = ?',
    'DELETE FROM partner_invites WHERE partner_id = ?',
    'DELETE FROM partner_agreements WHERE partner_id = ?',
    'DELETE FROM partner_starters WHERE partner_id = ?',
    'DELETE FROM partner_codes WHERE partner_id = ?',
    'DELETE FROM partner_commissions WHERE partner_id = ?',
    'DELETE FROM partner_payouts WHERE partner_id = ?',
    'DELETE FROM partner_terms WHERE partner_id = ?',
    'DELETE FROM partners WHERE id = ?',
  ]) {
    await db.run(sql, [id])
  }

  await log({ kind: 'partner', subjectId: id, founder: opts.by, reason: opts.reason, summary: check.summary })
  return check
}

// ─── Orders ──────────────────────────────────────────────────────────────────

/**
 * Whether this order can be removed outright, and what goes with it.
 *
 * Two refusals, both about the world outside this database:
 *
 *  • It is WITH THE SUPPLIER. Deleting our row does not stop PowerBody picking
 *    and shipping it; it only means nobody here knows they are.
 *  • It was PAID FOR, and not refunded. A captured payment is money that moved.
 *    Deleting the order does not give it back, and an order missing from the
 *    books while the card statement still shows the charge is the worst kind of
 *    discrepancy to find later. Refund it first, then delete.
 *
 * A £0.00 order, a mock one, a cancelled or refunded one, and anything never
 * paid for are all fair game — which is the whole population a founder wants to
 * clear out.
 */
export async function checkOrderDeletion(id: string): Promise<DeletionCheck> {
  const order = await getOrder(id)
  if (!order) return { ok: false, reason: 'No such order.', summary: '', effects: [] }

  const summary = `${order.reference ?? order.id} · £${order.total.toFixed(2)}${
    order.email ? ` · ${order.email}` : ''
  }`

  if (order.supplierOrderId) {
    return {
      ok: false,
      summary,
      effects: [],
      reason:
        'This order is already with PowerBody. Cancel it at their end first — deleting it here would not ' +
        'stop them shipping it, it would only mean nobody here knew they had.',
    }
  }

  if (order.stripePaymentIntentId && order.status === 'paid') {
    return {
      ok: false,
      summary,
      effects: [],
      reason:
        'This order was paid for and not refunded. Deleting it would not give the money back, and the books ' +
        'would disagree with the card statement. Refund it first, then delete it.',
    }
  }

  const effects: string[] = ['It disappears from the queue and from every total.']
  const db = await getEngine()
  const commissions = await db.all<{ id: string }>(
    'SELECT id FROM partner_commissions WHERE order_id = ?',
    [id],
  )
  if (commissions.length > 0) {
    effects.push(
      `${commissions.length} partner commission row${commissions.length === 1 ? '' : 's'} on it go too — ` +
        'commission on an order that no longer exists is a claim on nothing.',
    )
  }
  const starter = await db.get<{ code: string }>(
    'SELECT code FROM partner_starters WHERE order_id = ?',
    [id],
  )
  if (starter) {
    effects.push(
      `The partner starter ${starter.code} spent on it is given back, so they can still claim the free ` +
        'stack they signed for.',
    )
  }
  return { ok: true, summary, effects }
}

/**
 * Delete an order outright.
 *
 * The two things pointing AT an order are tidied first, and they are tidied
 * differently on purpose:
 *
 *  • A commission is deleted. It is a claim to money for an order that will not
 *    exist a line later.
 *  • A starter is GIVEN BACK. The partner signed an agreement and took their
 *    one free stack; our decision to delete the order is not a reason for them
 *    to lose it. A founder code is released for the same reason, though its
 *    24-hour life usually makes the point moot.
 */
export async function deleteOrder(
  id: string,
  opts: { by?: string | null; reason?: string | null } = {},
): Promise<DeletionCheck> {
  const check = await checkOrderDeletion(id)
  if (!check.ok) return check

  const db = await getEngine()
  await db.run('DELETE FROM partner_commissions WHERE order_id = ?', [id])
  await db.run(
    `UPDATE partner_starters SET used_at = NULL, order_id = NULL, claim_token = NULL, claimed_at = NULL
      WHERE order_id = ?`,
    [id],
  )
  await db.run(
    `UPDATE founder_codes SET used_at = NULL, order_id = NULL, claim_token = NULL, claimed_at = NULL
      WHERE order_id = ?`,
    [id],
  )
  await db.run('DELETE FROM orders WHERE id = ?', [id])

  await log({ kind: 'order', subjectId: id, founder: opts.by, reason: opts.reason, summary: check.summary })
  return check
}

// ─── Reading the tombstones ──────────────────────────────────────────────────

export interface DeletionEntry {
  id: string
  kind: DeletionKind
  subjectId: string
  founder: string | null
  reason: string | null
  summary: string
  createdAt: string
}

export async function recentDeletions(limit = 50): Promise<DeletionEntry[]> {
  const db = await getEngine()
  const rows = await db.all<{
    id: string
    kind: string
    subject_id: string
    founder: string | null
    reason: string | null
    summary: string
    created_at: string
  }>('SELECT * FROM deletion_log ORDER BY created_at DESC LIMIT ?', [limit])
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as DeletionKind,
    subjectId: r.subject_id,
    founder: r.founder,
    reason: r.reason,
    summary: r.summary,
    createdAt: r.created_at,
  }))
}
