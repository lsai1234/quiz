/**
 * Whether a hub sign-in with no stored plan gets handed the demo one.
 *
 * `/api/hub/subscription` used to seed `createMockSubscription` for ANY account
 * that had none, and save it. That is the right behaviour for `npm run dev` —
 * the whole product is demoable with no credentials, and the sign-in screen says
 * so — and completely wrong anywhere real: a customer who created an account and
 * never bought anything was shown a stack, a monthly price and delivery dates
 * that were not theirs, persisted to their account, and offered buttons to
 * "manage" it.
 *
 * The rule is one line: **never fabricate a plan on a deployment that can take
 * money.** `getPaymentSource()` is already the resolver for that question — it
 * returns `stripe` only when the mode asks for it AND the credentials exist, so
 * a half-configured deployment falls back to mock here exactly as it does for
 * payments.
 *
 * `HUB_DEMO_SUBSCRIPTION=off` turns the seeding off anywhere. It exists so the
 * empty-hub screen can be worked on locally, which otherwise needs live Stripe
 * keys to see. There is deliberately no `on`: nothing should be able to switch
 * fabricated data back on where the cards are real.
 *
 * Server-only.
 */
import { getPaymentSource } from '@/lib/payments'

export function seedsDemoSubscription(): boolean {
  if (getPaymentSource() === 'stripe') return false
  return (process.env.HUB_DEMO_SUBSCRIPTION ?? '').trim().toLowerCase() !== 'off'
}
