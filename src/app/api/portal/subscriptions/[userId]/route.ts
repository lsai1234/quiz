import { NextResponse } from 'next/server'
import { getFounder } from '@/lib/portal/guard'
import { logMemberAccess } from '@/lib/portal/access-log'
import { getSubscription } from '@/lib/db/hub-data'
import { getUserById } from '@/lib/db/users'
import { listChanges } from '@/lib/changes/repo'
import { listNotifications } from '@/lib/notify/outbox'
import { listConsents } from '@/lib/legal/consent'
import { policyForLine } from '@/lib/changes/policy'
import { constraintsFor, describeConstraints } from '@/lib/changes/safety'

export const dynamic = 'force-dynamic'

/**
 * GET — one member, everything about them in one read.
 *
 * Deliberately includes the billing history, their consent record and what
 * we've emailed them. When someone asks "why did my plan change and why didn't
 * anyone tell me", this page has to be able to answer it without a database
 * console.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  // The founder rather than a bare boolean: opening a member's whole record is
  // exactly the access that has to be attributable to a person.
  const founder = await getFounder()
  if (!founder) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId } = await ctx.params
  const subscription = await getSubscription(userId)
  if (!subscription) return NextResponse.json({ error: 'No subscription for that member' }, { status: 404 })

  // Awaited so a record cannot be served without the access being written —
  // an audit log that loses entries under load is not one. It never throws; see
  // the module.
  await logMemberAccess({
    founderEmail: founder.email,
    userId,
    kind: 'member-record',
    path: `/api/portal/subscriptions/${userId}`,
  })

  const [user, changes, notifications, consents] = await Promise.all([
    getUserById(userId),
    listChanges({ userId }),
    listNotifications({ userId, limit: 50 }),
    listConsents(userId),
  ])

  return NextResponse.json({
    userId,
    user: user ? { email: user.email, name: user.name, createdAt: user.createdAt } : null,
    subscription,
    // The effective policy per line, resolved once here so the UI doesn't have
    // to re-implement the precedence rules.
    linePolicies: Object.fromEntries(
      subscription.lines.map((l) => [l.id, policyForLine(subscription, l)]),
    ),
    constraints: describeConstraints(constraintsFor(subscription)),
    billingHistory: subscription.billingHistory ?? [],
    changes,
    notifications,
    consents,
  })
}
