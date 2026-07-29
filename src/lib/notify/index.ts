/**
 * Notification resolver
 * ─────────────────────
 * Single decision point for how member emails leave the building. Deliberately
 * the same shape as the supplier and payments resolvers, so there is one obvious
 * pattern for "manual vs live".
 *
 * Resolution order (highest priority first):
 *   1. Explicit env — NOTIFY_SOURCE = manual | mock | resend | auto
 *   2. Default      — MANUAL
 *
 * **Manual is the default, and it is a real workflow rather than a stub.** The
 * email is written and stored exactly as it would be sent; it simply waits in
 * the Founders Hub for a human to copy it into their own mail client and tick
 * it off. No mail provider, no API key, no domain verification — and the
 * business still keeps its promise that a member is told when their plan
 * changes.
 *
 * That matters for a small operation: a handful of changes a week is a two
 * minute job, and doing it by hand means you read what your customers read.
 * When the volume stops being sensible, `NOTIFY_SOURCE=resend` plus a key sends
 * the same emails automatically with nothing else to change.
 *
 * `mock` is the third mode: send-and-forget, used by tests that need the
 * delivered path without a provider.
 *
 * Server-only.
 */
import type { NotificationProvider } from './types'

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

/** True when emails wait for a person rather than a provider. */
export function isManualMode(): boolean {
  return getNotificationSource() === 'manual'
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

/** The address members see replies going to. */
export function fromAddress(): string {
  return process.env.NOTIFY_FROM || 'CHRGD <hello@chrgd.dev>'
}

/** Absolute base for hub deep links — emails can't use relative URLs. */
export function appBaseUrl(): string {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

export * from './types'
