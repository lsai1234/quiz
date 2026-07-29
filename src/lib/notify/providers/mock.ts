/**
 * Mock notifier — the default.
 *
 * Deliberately does nothing but succeed. The email has already been rendered
 * and written to the outbox by the time a provider is called, so the outbox row
 * IS the record: the Founders Hub can show exactly what would have gone out, to
 * whom, with the real subject and body. That makes the whole journey demoable
 * with no API key, and means going live changes one env var rather than a code
 * path nobody has run.
 */
import type { NotificationProvider, RenderedEmail, SendResult } from '../types'

export function createMockProvider(): NotificationProvider {
  return {
    name: 'mock',
    async send(to: string, email: RenderedEmail): Promise<SendResult> {
      if (process.env.NOTIFY_DEBUG) {
        console.info(`[notify:mock] → ${to}: ${email.subject}`)
      }
      return { providerId: `mock_${Date.now().toString(36)}` }
    },
  }
}
