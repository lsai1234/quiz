import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import {
  getStripeEnvironmentSetting,
  setStripeEnvironmentSetting,
  syncPortalRuntime,
} from '@/lib/portal/store'
import {
  currentStripeWorld,
  getPaymentSource,
  stripeKeysFor,
  stripeKeyProblems,
  STRIPE_ENVIRONMENTS,
  type StripeEnvironment,
} from '@/lib/payments'

/**
 * GET/POST the test-vs-live Stripe switch.
 *
 * Sibling of `/api/portal/payment-source`, and deliberately not folded into it:
 * that route answers "charge anybody at all?", this one answers "in which
 * world?". Two settings, two requests, so neither can be changed by accident
 * while aiming at the other.
 *
 * The GET reports what each environment HAS as well as which is selected — the
 * hub needs to be able to say "you have no live keys yet" before the founder
 * presses the thing that would have switched to them.
 *
 * Secrets never leave the server: only booleans and the last four characters of
 * the secret key, which is enough to tell two keys apart when checking a paste
 * against the Stripe dashboard and not enough to be one.
 */

export const dynamic = 'force-dynamic'

function describe(environment: StripeEnvironment) {
  const keys = stripeKeysFor(environment)
  return {
    environment,
    hasSecretKey: keys.secretKey !== null,
    hasWebhookSecret: keys.webhookSecret !== null,
    hasPublishableKey: keys.publishableKey !== null,
    /** Last four of the secret key, so a founder can confirm which key it is. */
    secretKeyTail: keys.secretKey ? keys.secretKey.slice(-4) : null,
  }
}

async function state() {
  const selected = await getStripeEnvironmentSetting()
  return {
    environment: selected,
    environments: STRIPE_ENVIRONMENTS.map(describe),
    /** What the money is actually doing right now, both switches applied. */
    paymentSource: getPaymentSource(),
    world: currentStripeWorld(),
    problems: stripeKeyProblems(),
  }
}

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()
  return NextResponse.json(await state())
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { environment?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const environment = body.environment as StripeEnvironment
  if (!STRIPE_ENVIRONMENTS.includes(environment)) {
    return NextResponse.json({ error: 'environment must be test | live' }, { status: 400 })
  }

  // Refuse to select a world there is no key for. The resolver would fall back
  // to mock anyway, but silently: a founder who pressed "Live" and saw it stick
  // would have every reason to believe the shop was taking money.
  if (stripeKeysFor(environment).secretKey === null) {
    return NextResponse.json(
      {
        error: `No usable ${environment}-mode secret key is configured, so switching would stop checkout charging anybody. Set STRIPE_${environment.toUpperCase()}_SECRET_KEY first.`,
      },
      { status: 409 },
    )
  }

  await setStripeEnvironmentSetting(environment)
  return NextResponse.json(await state())
}
