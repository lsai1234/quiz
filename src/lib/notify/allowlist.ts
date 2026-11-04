/**
 * The test allowlist (plan rule: "During development, only send emails to the
 * test allowlist").
 *
 * Outside the live payments world (a mock checkout, or Stripe test keys), a
 * real provider only delivers to addresses on `NOTIFY_TEST_ALLOWLIST`: a comma
 * separated list of addresses (`lewis@example.com`) and whole domains
 * (`@chrgd.dev`). Anything else is held: the send fails with a reason the
 * outbox records on the row, so a founder can see what would have gone and
 * send a copy to themselves.
 *
 * With no list set, nothing leaves a non-live deployment. The mock provider
 * sends nothing anyway and is never wrapped.
 */
import type { NotificationProvider } from './types'

export const ALLOWLIST_ENV = 'NOTIFY_TEST_ALLOWLIST'

export class HeldForTestingError extends Error {
  constructor(to: string) {
    super(`Held: ${to} is not on the test allowlist (${ALLOWLIST_ENV}). Nothing is sent outside live payments except to that list.`)
    this.name = 'HeldForTestingError'
  }
}

/** The allowlist, lower-cased: addresses, and domains written as "@domain". */
export function testAllowlist(env: Record<string, string | undefined> = process.env): string[] {
  return (env[ALLOWLIST_ENV] ?? '')
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 1 && s.includes('@'))
}

export function recipientAllowed(to: string, list: readonly string[]): boolean {
  const address = to.trim().toLowerCase()
  const at = address.lastIndexOf('@')
  if (at < 1) return false
  const domain = address.slice(at)
  return list.some((entry) => (entry.startsWith('@') ? entry === domain : entry === address))
}

/**
 * A provider that refuses recipients off the list while `isLive()` is false.
 * `isLive` is asked at send time, so a founder switching payments to live
 * lifts the hold without a restart.
 */
export function guardedForTesting(
  provider: NotificationProvider,
  isLive: () => boolean | Promise<boolean>,
  list: () => readonly string[] = () => testAllowlist(),
): NotificationProvider {
  return {
    ...provider,
    async send(to, email, envelope) {
      if (!(await isLive()) && !recipientAllowed(to, list())) throw new HeldForTestingError(to)
      return provider.send(to, email, envelope)
    },
  }
}
