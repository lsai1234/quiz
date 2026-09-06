/**
 * Redeeming a partner starter — the one place a starter turns into a free box.
 *
 * ── Who is asking, and how we know ──────────────────────────────────────────
 * The partner's own SESSION, and nothing else. There is no code to type and no
 * identifier in the request: the caller says "this visit is a claim", and this
 * module decides whose claim it is from the session cookie set when they signed
 * their agreement.
 *
 * That is a deliberate replacement for the `PS-…` code this used to take. A
 * code made a gift look like a discount, put a 100%-off string into the world,
 * and made a partner do four steps of admin to receive something we were giving
 * them. The link in their portal is now the only door.
 *
 * ── Advisory versus real ────────────────────────────────────────────────────
 *   • `starterForSession` answers "does this person have one, and what is it
 *     worth?" — for the screens. It takes nothing.
 *   • `claimStarterForCheckout` is the real one. It takes the starter before
 *     the order exists and hands back a token the caller must either spend
 *     (`markStarterUsed`) or give back (`releaseStarter`).
 *
 * A checkout that only called the first would let one starter raise as many
 * free orders as the button was pressed.
 *
 * Server-only.
 */
import { getSessionPartner } from '@/lib/partners/auth'
import type { Partner } from '@/lib/partners/types'
import * as repo from './repo'
import { listStartersForPartner } from './repo'
import { checkStarter, starterFits, starterState, starterWorksOn, type StarterChannel } from './rules'
import type { PartnerStarter } from './types'

export type StarterCheckResult =
  | { ok: true; starter: PartnerStarter; partner: Partner }
  | { ok: false; reason: string }

/**
 * The signed-in partner's spendable starter, if they have one.
 *
 * Returns `null` — not a refusal — when nobody is signed in or this partner has
 * no starter at all. That is the ordinary case for everybody who is not a
 * partner mid-claim, and it must fall through to the normal journey silently
 * rather than producing an error about a programme they are not in.
 */
export async function starterForSession(
  context: { channel?: StarterChannel | null; now?: Date } = {},
): Promise<StarterCheckResult | null> {
  const partner = await getSessionPartner()
  if (!partner) return null

  const starters = await listStartersForPartner(partner.id)
  // The one they can actually spend. A used or expired one is not a refusal to
  // show anybody — it is simply not a live claim.
  const starter = starters.find((s) => starterState(s, context.now) === 'ready')
  if (!starter) {
    // An UNSIGNED one is worth speaking up about: they are one form away, and
    // silence would send them through a whole quiz to find out. `checkStarter`
    // owns that wording, so the message here is the same one every other
    // refusal path gives.
    const unsigned = starters.find((s) => starterState(s, context.now) === 'unsigned')
    if (!unsigned) return null
    const refusal = checkStarter(unsigned, context.now)
    return { ok: false, reason: refusal.ok ? 'Sign your agreement first.' : refusal.reason }
  }

  if (!starterWorksOn(context.channel ?? null)) {
    return { ok: false, reason: 'A starter covers the stack the quiz builds you, bought once.' }
  }

  const check = checkStarter(starter, context.now)
  if (!check.ok) return { ok: false, reason: check.reason }

  /*
    Suspension, checked here rather than assumed.

    `getSessionPartner` already turns a suspended partner away, so this is the
    belt to that braces — but the rule it enforces is worth stating where the
    money moves: a suspended partner's commercial code stops working the moment
    they are suspended, and a starter that carried on buying free boxes would be
    the same instrument with the safety removed.
  */
  if (partner.status === 'suspended') return { ok: false, reason: 'That claim is no longer available.' }

  return { ok: true, starter, partner }
}

export type StarterClaim =
  | { ok: true; starter: PartnerStarter; partner: Partner; token: string }
  | { ok: false; reason: string }

/**
 * Take the signed-in partner's starter for this checkout.
 *
 * Everything is re-checked here rather than trusting whatever the screen
 * decided: between pressing the button and pressing pay, a starter can expire,
 * be revoked, or be spent in another tab. Then the claim decides the race — see
 * `claimStarter`.
 *
 * `goodsListSubtotal` is what the basket would have cost anybody else, and it
 * is checked BEFORE the claim: a basket over the cap is going to be refused,
 * and refusing it after taking the starter would spend one on an order that was
 * never going to exist.
 *
 * The caller OWNS the returned token and must resolve it:
 *   • order raised  → `markStarterUsed(code, token, orderId)`
 *   • anything else → `releaseStarter(code, token)`
 */
export async function claimStarterForCheckout(context: {
  channel?: StarterChannel | null
  goodsListSubtotal: number
  format: (n: number) => string
  now?: Date
}): Promise<StarterClaim | null> {
  const found = await starterForSession({ channel: context.channel, now: context.now })
  if (found === null) return null
  if (!found.ok) return found

  const fit = starterFits(found.starter, context.goodsListSubtotal, context.format)
  if (!fit.ok) return { ok: false, reason: fit.reason }

  const token = await repo.claimStarter(found.starter.code)
  if (!token) return { ok: false, reason: 'That claim is being used right now.' }
  return { ok: true, starter: found.starter, partner: found.partner, token }
}

export { markStarterUsed, releaseStarter } from './repo'
