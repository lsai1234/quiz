/**
 * Notification resolver
 * ─────────────────────
 * Single decision point for how member emails leave the building. Deliberately
 * the same shape as the supplier and payments resolvers, so there is one obvious
 * pattern for "manual vs live".
 *
 * There are three rungs on the ladder, and you climb them as the volume
 * justifies it. Every rung uses the same emails and the same page — only who
 * presses send changes:
 *
 *   `manual` (default) — no provider at all. The email waits in the Founders
 *       Hub for a human to copy into their own mail client and tick off. No API
 *       key, no domain verification, and the promise that a member is told still
 *       holds.
 *
 *   `resend` — a provider is configured, and each email gets a **Send** button.
 *       One click delivers it and marks it sent. Still your decision, still your
 *       eyes on the message, without the copy-paste.
 *
 *   `auto` — the same provider, sending by itself. The daily job flushes the
 *       queue and you only look when something fails.
 *
 * Resolution order: explicit `NOTIFY_SOURCE` env, else MANUAL.
 *
 * `mock` is a fourth, test-only mode: sends and forgets, so the delivered path
 * is exercisable without a provider.
 *
 * Server-only.
 */
import type { NotificationProvider, TemplateId } from './types'

/** Which provider actually delivers — `manual` meaning "a person does". */
export type NotificationSource = 'manual' | 'mock' | 'resend'
export type NotificationMode = 'auto' | 'manual' | 'mock' | 'resend'

export function hasResendCredentials(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

export function getNotificationMode(): NotificationMode {
  const raw = (process.env.NOTIFY_SOURCE ?? 'manual').toString().trim().toLowerCase()
  if (raw === 'resend') return 'resend'
  if (raw === 'auto') return 'auto'
  if (raw === 'mock') return 'mock'
  return 'manual'
}

/**
 * How email leaves right now. A forced `resend` without an API key falls back to
 * MANUAL rather than silently dropping anything — a missing key must never mean
 * a member's plan changed and nobody told them. The email stays in the queue
 * where a human can see it and send it.
 */
export function getNotificationSource(): NotificationSource {
  const mode = getNotificationMode()
  if (mode === 'manual') return 'manual'
  if (mode === 'mock') return 'mock'
  return hasResendCredentials() ? 'resend' : 'manual'
}

/** True when there is no provider at all — copy it out and tick it off. */
export function isManualMode(): boolean {
  return getNotificationSource() === 'manual'
}

/**
 * True when the hub can send an email itself, i.e. a provider is configured.
 * Drives the Send button: no provider, no button.
 */
export function canSendFromHub(): boolean {
  return getNotificationSource() !== 'manual'
}

// ─── What sends by itself, and what waits for a person ───────────────────────

/**
 * How much leaves without anyone pressing anything.
 *
 *   `none`          — everything waits in the hub. The default with no provider,
 *                     because there is nothing to send with.
 *   `confirmations` — receipts send themselves; everything else waits. **The
 *                     default once a provider is configured.**
 *   `all`           — nothing waits.
 *
 * The split is not a compromise between the other two, it is the right answer,
 * and the reason is that the two kinds of email have opposite failure modes:
 *
 *  • A **receipt** is expected within seconds of paying. Its content was decided
 *    entirely by what the customer just did, there is no judgement in it, and a
 *    human in the loop can only make it late. A confirmation that arrives the
 *    next morning — because nobody was at a laptop on Sunday — reads as a shop
 *    that has lost the order, and generates the support email it was meant to
 *    prevent.
 *  • Everything else says something we **decided**: a product swapped, a price
 *    raised, a plan settled. Those have judgement in them, they are occasionally
 *    wrong, and they are worth a person's eyes before several hundred people
 *    read them. Nobody is waiting on them by the second.
 */
export type AutoSendPolicy = 'none' | 'confirmations' | 'all'

/**
 * The templates that send themselves under the `confirmations` policy.
 *
 * Deliberately a short, explicit list rather than a rule about streams or
 * naming. Adding an email to it means deciding that nobody needs to read it
 * before a customer does, and that decision should cost a line in this file.
 */
const SELF_SENDING: readonly TemplateId[] = ['order-confirmation', 'subscription-confirmation']

export function getAutoSendPolicy(): AutoSendPolicy {
  const raw = (process.env.NOTIFY_AUTO_SEND ?? '').trim().toLowerCase()

  // An explicit setting always wins — including over `NOTIFY_SOURCE=auto`, so
  // "send everything, except actually send nothing while I look at something"
  // is one variable rather than a re-plumbing.
  if (raw === 'none' || raw === 'off') return 'none'
  if (raw === 'all') return canSendFromHub() ? 'all' : 'none'
  if (raw === 'confirmations') return canSendFromHub() ? 'confirmations' : 'none'

  // `NOTIFY_SOURCE=auto` predates this setting and meant "all". Still does.
  if (getNotificationMode() === 'auto' && hasResendCredentials()) return 'all'
  if (getNotificationSource() === 'mock') return 'all'

  // A provider, but no explicit instruction: receipts go, decisions wait.
  return canSendFromHub() ? 'confirmations' : 'none'
}

/** Whether this particular email goes without anyone pressing anything. */
export function sendsAutomatically(template: TemplateId): boolean {
  const policy = getAutoSendPolicy()
  if (policy === 'none') return false
  if (policy === 'all') return true
  return SELF_SENDING.includes(template)
}

/** True when anything at all sends unattended. */
export function isAutoSendEnabled(): boolean {
  return getAutoSendPolicy() !== 'none'
}

/** Throws in manual mode — nothing should be asking for a provider there. */
export async function getNotifier(): Promise<NotificationProvider> {
  if (getNotificationSource() === 'resend') {
    const { createResendProvider } = await import('./providers/resend')
    return createResendProvider()
  }
  const { createMockProvider } = await import('./providers/mock')
  return createMockProvider()
}

/**
 * The fallback sending address.
 *
 * Each email now leaves from its own stream's address — see `./streams` — which
 * is resolved when it is queued and stored on the row. This remains for the two
 * cases that have no stream: a notification written before streams existed, and
 * a deployment that has only ever set `NOTIFY_FROM`.
 */
export function fromAddress(): string {
  return process.env.NOTIFY_FROM || 'CHRGD <hello@chrgd.dev>'
}

/** Absolute base for hub deep links — emails can't use relative URLs. */
export function appBaseUrl(): string {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

export * from './types'
export * from './streams'
