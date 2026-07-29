/**
 * Notification resolver
 * ─────────────────────
 * Single decision point for whether member emails go out through a real
 * provider or stay in the outbox. Deliberately the same shape as the supplier
 * and payments resolvers, so there is one obvious pattern for "mock vs live".
 *
 * Resolution order (highest priority first):
 *   1. Explicit env — NOTIFY_SOURCE = mock | resend | auto
 *   2. Default      — MOCK
 *
 * Mock is the default ON PURPOSE, and mock here is not a stub: the email is
 * still rendered and still recorded in the outbox, it just isn't handed to a
 * mail provider. The whole journey — detect, apply, queue, render, show what
 * went out — is exercisable with no API key, and going live is one env var.
 *
 * Server-only.
 */
import type { NotificationProvider } from './types'

export type NotificationSource = 'mock' | 'resend'
export type NotificationMode = 'auto' | 'mock' | 'resend'

export function hasResendCredentials(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

export function getNotificationMode(): NotificationMode {
  const raw = (process.env.NOTIFY_SOURCE ?? 'mock').toString().trim().toLowerCase()
  if (raw === 'resend') return 'resend'
  if (raw === 'auto') return 'auto'
  return 'mock'
}

/**
 * The provider to use right now. A forced `resend` without an API key still
 * falls back to mock — a missing key must never mean a member's plan changed
 * and the send threw; the email stays queued and visible instead.
 */
export function getNotificationSource(): NotificationSource {
  const mode = getNotificationMode()
  if (mode === 'mock') return 'mock'
  return hasResendCredentials() ? 'resend' : 'mock'
}

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
