'use client'

import type { BasketLine } from './types'
import { useBasket } from './store'

/**
 * Emptying the basket once what's in it has been paid for.
 *
 * Nothing used to: a customer who paid came back to the shop to find the same
 * products still in their basket, a click from buying them twice. The basket
 * can't simply be emptied when checkout starts (a card declined, or a change of
 * mind on Stripe's page, and the basket is gone) nor on every confirmation page
 * (that page is also opened later from an email, by which time the basket may
 * hold a new order).
 *
 * So checkout remembers what it was sent, for this tab only, and a confirmed
 * purchase empties the basket only if the basket still holds exactly that.
 */

const KEY = 'chrgd-basket-paying'

/** The basket's contents as one string: product, variant and quantity, in order. */
export function basketSignature(lines: readonly Pick<BasketLine, 'productId' | 'variantId' | 'quantity'>[]): string {
  return lines
    .map((l) => `${l.productId}:${l.variantId}:${l.quantity}`)
    .sort()
    .join('|')
}

/** Called as checkout starts: what this tab is paying for. */
export function rememberBasketBeingPaid(): void {
  try {
    sessionStorage.setItem(KEY, basketSignature(useBasket.getState().lines))
  } catch {
    // Private browsing or storage switched off: the basket then stays, as before.
  }
}

/** Called once a purchase is confirmed: empty the basket if it's still what was paid for. */
export function releasePaidBasket(): boolean {
  try {
    const paid = sessionStorage.getItem(KEY)
    if (paid === null) return false
    sessionStorage.removeItem(KEY)
    const { lines, clear } = useBasket.getState()
    if (lines.length > 0 && basketSignature(lines) === paid) {
      clear()
      return true
    }
  } catch {
    // As above.
  }
  return false
}
