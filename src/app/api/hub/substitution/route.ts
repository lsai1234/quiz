import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { getSubscription, saveSubscription } from '@/lib/db/hub-data'
import { applyPolicyMap, setDefaultChangePolicy } from '@/lib/changes/policy'
import type { ChangePolicy } from '@/lib/recharge/types'

export const dynamic = 'force-dynamic'

const POLICIES: ChangePolicy[] = ['auto-swap', 'remove']

function isPolicy(value: unknown): value is ChangePolicy {
  return typeof value === 'string' && (POLICIES as string[]).includes(value)
}

/**
 * PATCH /api/hub/substitution
 *
 * Sets what happens to a member's products if they become unavailable. Accepts
 * either shape:
 *
 *   { policies: { [productId]: 'auto-swap' | 'remove' } }  — current
 *   { defaultPolicy: 'auto-swap' | 'remove' }              — plan-wide
 *   { substitutions: { [productId]: boolean } }            — legacy
 *
 * The legacy boolean is still honoured because older clients may be in flight:
 * `true` means auto-swap, `false` now means remove rather than the old "hold and
 * contact me", which no longer exists.
 */
export async function PATCH(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let body: {
    policies?: Record<string, unknown>
    defaultPolicy?: unknown
    substitutions?: Record<string, unknown>
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Normalise every accepted shape into one product → policy map.
  const map: Record<string, ChangePolicy> = {}
  for (const [productId, value] of Object.entries(body.policies ?? {})) {
    if (!isPolicy(value)) {
      return NextResponse.json({ error: `policies.${productId} must be one of ${POLICIES.join(', ')}` }, { status: 400 })
    }
    map[productId] = value
  }
  for (const [productId, value] of Object.entries(body.substitutions ?? {})) {
    map[productId] = value ? 'auto-swap' : 'remove'
  }

  const hasDefault = body.defaultPolicy !== undefined
  if (hasDefault && !isPolicy(body.defaultPolicy)) {
    return NextResponse.json({ error: `defaultPolicy must be one of ${POLICIES.join(', ')}` }, { status: 400 })
  }
  if (Object.keys(map).length === 0 && !hasDefault) {
    return NextResponse.json(
      { error: 'Provide policies, defaultPolicy, or substitutions' },
      { status: 400 },
    )
  }

  const sub = await getSubscription(user.id)
  if (!sub) return NextResponse.json({ error: 'No subscription found' }, { status: 404 })

  // Default first: it only touches lines without a choice of their own, so a
  // request carrying both still lands the per-product overrides.
  let next = hasDefault ? setDefaultChangePolicy(sub, body.defaultPolicy as ChangePolicy) : sub
  next = applyPolicyMap(next, map)

  await saveSubscription(user.id, next)
  return NextResponse.json({ ok: true, defaultChangePolicy: next.defaultChangePolicy })
}
