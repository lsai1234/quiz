/**
 * Turning an applied change into the email the member gets.
 *
 * This is the seam between the two domains: `lib/changes` decides and applies,
 * `lib/notify` renders and sends, and this file is the only place that knows
 * about both. Kept pure — it builds the notification input, the caller queues
 * it — so the wording for any given event is testable without a database.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscription } from '@/lib/recharge/types'
import type { ChangeEvent } from '@/lib/changes/types'
import { productRemoved, productSubstituted, type RemovalReason } from './templates'
import type { QueueInput, TemplateId } from './types'

/** Deep links into the hub flow that can act on the change. */
export const hubLinks = {
  /** Opens `ChangeProductFlow` on that line — "pick something else instead". */
  change: (base: string, lineId: string) => `${base}/hub?change=${encodeURIComponent(lineId)}`,
  /** Opens `AddProductSheet` filtered to that category — "browse replacements". */
  add: (base: string, swapGroup: string) => `${base}/hub?add=${encodeURIComponent(swapGroup)}`,
  hub: (base: string) => `${base}/hub`,
}

/**
 * Why a line was removed, in terms the member's email can explain.
 *
 * The distinction between "there was nothing" and "there was nothing SAFE" is
 * the one worth preserving: someone who opted into swaps and didn't get one is
 * owed the real reason, and "we wouldn't risk your allergies" is a much better
 * answer than silence.
 */
function removalReasonFor(event: ChangeEvent): RemovalReason {
  switch (event.intendedAction.reason) {
    case 'member-chose-remove':
      return 'member-choice'
    case 'no-safe-replacement':
      return 'nothing-suitable'
    default:
      return 'nothing-available'
  }
}

/** A couple of things the member might put in place of what they lost. */
function suggestionsFor(event: ChangeEvent, catalogue: CatalogueProduct[]): string[] {
  return catalogue
    .filter((p) => p.swapGroup === event.swapGroup && p.id !== event.productId && p.subscriptionEligible && !p.isSubscriptionOnly)
    .slice(0, 3)
    .map((p) => p.title)
}

export interface BuildOptions {
  baseUrl: string
  /** The member's plan AFTER the change — where the new monthly comes from. */
  subscription: MemberSubscription
  catalogue?: CatalogueProduct[]
}

/**
 * The email for an applied change, or null when there is nothing to say.
 *
 * Returns null for outcomes that didn't touch the member's plan — an absorbed
 * price rise, a dismissal, a hold. Emailing someone to tell them nothing changed
 * is noise, and noise is how people learn to ignore the emails that matter.
 */
export function notificationForEvent(event: ChangeEvent, opts: BuildOptions): QueueInput | null {
  const email = event.customerEmail ?? opts.subscription.customerEmail
  if (!email) return null

  const resolution = event.resolution ?? event.intendedAction.resolution
  const before = event.billingPreview?.currentMonthly ?? opts.subscription.flatMonthly
  const after = opts.subscription.flatMonthly
  const effectiveFrom = event.billingPreview?.effectiveFrom ?? event.appliedAt ?? event.updatedAt
  const base = { userId: event.userId, email, changeEventId: event.id }

  if (resolution.type === 'substitute') {
    const replacement =
      opts.subscription.lines.find((l) => l.id === event.lineId)?.productTitle ??
      event.suggestedReplacementTitle ??
      'a close match'

    return {
      ...base,
      template: 'product-substituted' as TemplateId,
      rendered: productSubstituted({
        productTitle: event.productTitle,
        replacementTitle: replacement,
        discontinued: event.kind === 'discontinued',
        monthlyBefore: before,
        monthlyAfter: after,
        effectiveFrom,
        changeUrl: hubLinks.change(opts.baseUrl, event.lineId),
      }),
    }
  }

  if (resolution.type === 'remove') {
    return {
      ...base,
      template: 'product-removed' as TemplateId,
      rendered: productRemoved({
        productTitle: event.productTitle,
        reason: removalReasonFor(event),
        discontinued: event.kind === 'discontinued',
        monthlyBefore: before,
        monthlyAfter: after,
        effectiveFrom,
        credit: event.billingPreview?.credit,
        addUrl: hubLinks.add(opts.baseUrl, event.swapGroup),
        suggestions: opts.catalogue ? suggestionsFor(event, opts.catalogue) : undefined,
      }),
    }
  }

  // hold / absorb / dismiss — the member's plan and price are untouched.
  return null
}
