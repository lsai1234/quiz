import { NextResponse } from 'next/server'
import { isPortalAuthed, getFounder } from '@/lib/portal/guard'
import { listSubscriptions, getSubscription, saveSubscription } from '@/lib/db/hub-data'
import { buildExitQueue } from '@/lib/portal/exits'

export const dynamic = 'force-dynamic'

/**
 * The exit queue.
 *
 * GET  /api/portal/exits → every plan that has ended, and what it left behind
 * POST /api/portal/exits { userId, action, note } → decide on one
 *
 * A settlement that was invoiced and declined is money owed on a cancelled plan
 * nobody is looking at. Without this it is invisible, and invisible unpaid
 * balances are how a feature meant to protect margin quietly costs more than it
 * recovers.
 *
 * Every action here is a founder overriding the automatic outcome, so every one
 * of them takes a note and records who did it. A waiver is a decision, not a
 * database edit.
 */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(buildExitQueue(await listSubscriptions()))
}

type Action = 'waive' | 'write-off' | 'mark-paid' | 'mark-refunded'

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { userId?: string; action?: Action; note?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.userId || !body.action) {
    return NextResponse.json({ error: 'userId and action are required' }, { status: 400 })
  }

  const sub = await getSubscription(body.userId)
  if (!sub?.exit) return NextResponse.json({ error: 'No exit recorded for this member' }, { status: 404 })

  const founder = await getFounder()
  const stamp = { note: body.note ?? null, by: founder?.email ?? null }
  const at = new Date().toISOString()

  const exit = { ...sub.exit, ...stamp }
  switch (body.action) {
    case 'waive':
      // Never collected, and never will be. The figure goes to zero so it stops
      // counting as owed anywhere; the note is why.
      exit.settlement = 0
      exit.waiver = 'founder-waived'
      break
    case 'write-off':
      // Still owed on paper, but we have stopped chasing. Kept distinct from a
      // waiver: one is a decision we made for the member, the other is one we
      // made about our own book, and the reporting should not blur them.
      exit.writtenOffAt = at
      break
    case 'mark-paid':
      // Paid by some route Stripe did not tell us about — a bank transfer, a
      // manual invoice payment.
      exit.paid = true
      break
    case 'mark-refunded':
      exit.refundedAt = at
      break
    default:
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 })
  }

  await saveSubscription(body.userId, { ...sub, exit })
  return NextResponse.json({ ok: true, exit })
}
