/**
 * Redeeming a founder code — the one place a code turns into a free or
 * cost-price order.
 *
 * Two entry points, and the difference between them matters:
 *
 *   • `checkFounderCode` is ADVISORY. It answers "would this work?" while
 *     somebody is typing, and takes nothing.
 *   • `claimFounderCodeForCheckout` is the real one. It takes the code before
 *     the order exists and hands back a token the caller must either spend
 *     (`markFounderCodeUsed`) or give back (`releaseFounderCode`).
 *
 * A checkout that only called the first one would let the same 100%-off code
 * raise as many free orders as it was pasted into.
 *
 * Server-only.
 */
import { checkFounderCode as checkRules, looksLikeFounderCode, normaliseFounderCode } from './codes'
import * as repo from './repo'
import type { FounderCode, FounderCodeKind } from './types'

/**
 * What is being bought.
 *
 * ONE-OFF ORDERS ONLY, and this is a guard rather than a note. A code that made
 * a SUBSCRIPTION free would not make one order free — it would make every
 * renewal free, for as long as the plan ran, long after the code itself had
 * expired. The 24-hour life is meaningless against a recurring charge, so the
 * recurring path simply cannot reach these codes.
 */
export type FounderChannel = 'shop' | 'quiz' | 'subscription'

const ELIGIBLE_CHANNELS: readonly FounderChannel[] = ['shop', 'quiz']

export function founderCodeWorksOn(channel: FounderChannel | null | undefined): boolean {
  // Unlike the partner codes, an unstated channel is NOT eligible. These take
  // 100% off; the safe default for a caller that forgot to say what it was
  // selling is "no", and a journey that goes quiet is a bug we will hear about
  // immediately, whereas a free subscription is one we would not.
  return channel != null && ELIGIBLE_CHANNELS.includes(channel)
}

export type FounderCheck =
  | { ok: true; code: FounderCode; kind: FounderCodeKind }
  | { ok: false; reason: string }

/**
 * Would this code work right now? Advisory — takes nothing, changes nothing.
 *
 * Returns `null` for anything that is not shaped like one of ours, so a caller
 * holding an unknown string can fall through to the partner codes without a
 * database round trip and without this module having an opinion about it.
 */
export async function checkFounderCode(
  input: string | null | undefined,
  context: { channel?: FounderChannel | null; now?: Date } = {},
): Promise<FounderCheck | null> {
  const typed = normaliseFounderCode(input ?? '')
  if (!typed || !looksLikeFounderCode(typed)) return null

  const code = await repo.getFounderCode(typed)
  // Shaped like ours but unknown: still not ours. Falling through lets the
  // partner path give the ordinary "we don't recognise that code", which is the
  // right answer and does not confirm the shape to somebody guessing.
  if (!code) return null

  if (!founderCodeWorksOn(context.channel)) {
    return { ok: false, reason: 'That code works on a one-off order, not on a subscription.' }
  }

  const check = checkRules(code, context.now)
  if (!check.ok) return { ok: false, reason: check.reason }
  return { ok: true, code, kind: code.kind }
}

export type FounderClaim =
  | { ok: true; code: FounderCode; kind: FounderCodeKind; token: string }
  | { ok: false; reason: string }

/**
 * Take the code for this checkout.
 *
 * The rules are re-checked here rather than trusting the advisory pass: between
 * someone typing a code and pressing pay it can expire, be revoked, or be spent
 * in another tab. Then the claim decides the race — see `claimFounderCode`.
 *
 * The caller OWNS the returned token and must resolve it:
 *   • order raised  → `markFounderCodeUsed(code, token, orderId)`
 *   • anything else → `releaseFounderCode(code, token)`
 * A token that is neither leaves the code stuck as "being used right now" until
 * it expires, which is a bad outcome but a safe one.
 */
export async function claimFounderCodeForCheckout(
  input: string | null | undefined,
  context: { channel?: FounderChannel | null; now?: Date } = {},
): Promise<FounderClaim | null> {
  const check = await checkFounderCode(input, context)
  if (check === null) return null
  if (!check.ok) return check

  const token = await repo.claimFounderCode(check.code.code)
  if (!token) return { ok: false, reason: 'That code is being used right now.' }
  return { ok: true, code: check.code, kind: check.kind, token }
}

export { markFounderCodeUsed, releaseFounderCode } from './repo'
