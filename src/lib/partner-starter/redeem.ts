/**
 * Redeeming a partner starter — the one place a starter turns into a free box.
 *
 * Two entry points, and the difference between them matters:
 *
 *   • `checkStarterCode` is ADVISORY. It answers "would this work?" while
 *     somebody is typing, and takes nothing.
 *   • `claimStarterForCheckout` is the real one. It takes the starter before
 *     the order exists and hands back a token the caller must either spend
 *     (`markStarterUsed`) or give back (`releaseStarter`).
 *
 * A checkout that only called the first would let one starter raise as many
 * free orders as it was pasted into.
 *
 * Server-only.
 */
import { getPartner } from '@/lib/partners/repo'
import type { Partner } from '@/lib/partners/types'
import * as repo from './repo'
import {
  checkStarter,
  looksLikeStarterCode,
  normaliseStarterCode,
  starterFits,
  starterWorksOn,
  type StarterChannel,
} from './rules'
import type { PartnerStarter } from './types'

export type StarterCheckResult =
  | { ok: true; starter: PartnerStarter; partner: Partner }
  | { ok: false; reason: string }

/**
 * Would this starter work right now? Advisory — takes nothing, changes nothing.
 *
 * Returns `null` for anything not shaped like one of ours, so a caller holding
 * an unknown string can fall through to the founder and partner codes without a
 * database round trip and without this module having an opinion about it.
 */
export async function checkStarterCode(
  input: string | null | undefined,
  context: { channel?: StarterChannel | null; now?: Date } = {},
): Promise<StarterCheckResult | null> {
  const typed = normaliseStarterCode(input ?? '')
  if (!typed || !looksLikeStarterCode(typed)) return null

  const starter = await repo.getStarter(typed)
  // Shaped like ours but unknown: still not ours. Falling through gives the
  // ordinary "we don't recognise that code", which is the right answer and does
  // not confirm the shape to somebody guessing.
  if (!starter) return null

  if (!starterWorksOn(context.channel ?? null)) {
    return {
      ok: false,
      reason: 'A starter code buys the stack the quiz builds you — take the quiz and use it there.',
    }
  }

  const check = checkStarter(starter, context.now)
  if (!check.ok) return { ok: false, reason: check.reason }

  /*
    The partner behind it, checked rather than assumed.

    A suspended partner's commercial code stops working the moment they are
    suspended; a starter that carried on buying free boxes for the same person
    would be the same instrument with the safety removed. Suspension is the only
    status that blocks — `invited` is the NORMAL state for somebody claiming a
    starter, since setting a password and taking your free stack happen in
    whichever order the partner gets round to them.
  */
  const partner = await getPartner(starter.partnerId)
  if (!partner) return { ok: false, reason: 'That code is not attached to a partner account.' }
  if (partner.status === 'suspended') return { ok: false, reason: 'That code has been cancelled.' }

  return { ok: true, starter, partner }
}

export type StarterClaim =
  | { ok: true; starter: PartnerStarter; partner: Partner; token: string }
  | { ok: false; reason: string }

/**
 * Take the starter for this checkout.
 *
 * The rules are re-checked here rather than trusting the advisory pass:
 * between typing a code and pressing pay it can expire, be revoked, or be spent
 * in another tab. Then the claim decides the race — see `claimStarter`.
 *
 * `goodsListSubtotal` is what the basket would have cost anybody else, and it
 * is checked BEFORE the claim: a basket over the cap is going to be refused, and
 * refusing it after taking the code would spend a starter on an order that was
 * never going to exist.
 *
 * The caller OWNS the returned token and must resolve it:
 *   • order raised  → `markStarterUsed(code, token, orderId)`
 *   • anything else → `releaseStarter(code, token)`
 */
export async function claimStarterForCheckout(
  input: string | null | undefined,
  context: {
    channel?: StarterChannel | null
    goodsListSubtotal: number
    format: (n: number) => string
    now?: Date
  },
): Promise<StarterClaim | null> {
  const check = await checkStarterCode(input, { channel: context.channel, now: context.now })
  if (check === null) return null
  if (!check.ok) return check

  const fit = starterFits(check.starter, context.goodsListSubtotal, context.format)
  if (!fit.ok) return { ok: false, reason: fit.reason }

  const token = await repo.claimStarter(check.starter.code)
  if (!token) return { ok: false, reason: 'That code is being used right now.' }
  return { ok: true, starter: check.starter, partner: check.partner, token }
}

export { markStarterUsed, releaseStarter } from './repo'
