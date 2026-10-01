/**
 * The number on the Founders Hub's Home Screen icon: orders waiting for review.
 *
 * Exactly the queue's own "Need review" count, so the icon and the screen it
 * opens can never disagree. That includes subscription boxes and leaves out
 * abandoned checkouts, both for the reasons the queue gives.
 *
 * iOS lets a web app set its badge only while it is running — when a
 * notification arrives (the service worker sets it from the message), or when
 * the hub is open. There is no way to change it silently in between, so a
 * number can be a little behind until one of those happens.
 */
import { listAwaitingFulfilment } from '@/lib/orders/repo'
import { buildFulfilmentQueue } from '@/lib/orders/queue'

export async function reviewCount(): Promise<number> {
  return buildFulfilmentQueue(await listAwaitingFulfilment()).pending
}
