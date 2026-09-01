/**
 * Which set of Stripe keys is in use: the test one, or the live one.
 *
 * A Stripe account is really two accounts. Test mode and live mode have their
 * own keys, their own webhook signing secrets, their own customers, prices and
 * subscriptions, and nothing crosses between them. So "are we on Stripe?"
 * (`./index.ts`) and "which Stripe?" are two different questions, and this
 * module owns the second one.
 *
 * Both key sets live in the environment at once, under names that say which
 * world they belong to. Switching worlds is then a *setting* — flipped from the
 * Founders Hub, applying on the next request — rather than an edit to the
 * deployment's environment variables followed by a redeploy. That matters most
 * on the day it is riskiest: going live is the moment you least want to be
 * hand-editing secrets in a dashboard and hoping you pasted the right one.
 *
 *   STRIPE_TEST_SECRET_KEY / STRIPE_TEST_WEBHOOK_SECRET / NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY
 *   STRIPE_LIVE_SECRET_KEY / STRIPE_LIVE_WEBHOOK_SECRET / NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY
 *
 * ── The prefix is the authority, not the variable name ──────────────────────
 * A key set under `STRIPE_LIVE_SECRET_KEY` that starts with `sk_test_` is
 * REJECTED rather than used, and the same in the other direction. The variable
 * name is a label somebody typed; `sk_live_` is what Stripe will actually
 * charge against. When those two disagree the label is the thing that is wrong,
 * and the failure mode of trusting it — a founder who believes they are in
 * test mode taking real money, or a "live" launch that silently charges nobody
 * — is bad enough in both directions to be worth refusing outright.
 *
 * This is also why `currentStripeWorld()` in `./index.ts` still reads the
 * resolved key's prefix rather than this module's selected environment: the
 * `mode` stamped on an order has to record what actually happened to the money.
 *
 * ── The single-key legacy ───────────────────────────────────────────────────
 * `STRIPE_SECRET_KEY` (and its webhook/publishable siblings) predates this and
 * still works. It fills in for whichever world its prefix says it belongs to,
 * so a deployment configured before this existed keeps behaving exactly as it
 * did, and only gains the switch once the second key set is added.
 *
 * Server-only for the secrets. The publishable keys are `NEXT_PUBLIC_*` and so
 * are inlined at build time — which is why they are read as whole literals
 * below and never through a computed property name.
 */

export type StripeEnvironment = 'test' | 'live'

export const STRIPE_ENVIRONMENTS: StripeEnvironment[] = ['test', 'live']

/** The three secrets that make up one Stripe world. */
export interface StripeKeySet {
  environment: StripeEnvironment
  secretKey: string | null
  webhookSecret: string | null
  publishableKey: string | null
}

/** Why a key that is present is not being used. */
export interface StripeKeyProblem {
  environment: StripeEnvironment
  variable: string
  detail: string
}

const SECRET_PREFIX: Record<StripeEnvironment, string> = {
  test: 'sk_test_',
  live: 'sk_live_',
}

const PUBLISHABLE_PREFIX: Record<StripeEnvironment, string> = {
  test: 'pk_test_',
  live: 'pk_live_',
}

/**
 * Placeholder values that read as "set" to a `!!value` check but are not keys.
 * The `.env.example` ships empty, but a copied `.env.local` often does not.
 */
function clean(raw: string | undefined): string | null {
  const value = (raw ?? '').trim()
  if (!value) return null
  if (/^(changeme|placeholder|your[-_]?key|sk_test_xxx|sk_live_xxx|xxx)$/i.test(value)) return null
  return value
}

/**
 * Stripe's own restricted keys (`rk_test_…` / `rk_live_…`) carry the same
 * world marker in the same position, so they classify identically.
 */
function worldOfSecret(key: string): StripeEnvironment | null {
  if (key.startsWith('sk_live_') || key.startsWith('rk_live_')) return 'live'
  if (key.startsWith('sk_test_') || key.startsWith('rk_test_')) return 'test'
  return null
}

function worldOfPublishable(key: string): StripeEnvironment | null {
  if (key.startsWith('pk_live_')) return 'live'
  if (key.startsWith('pk_test_')) return 'test'
  return null
}

/**
 * The publishable keys, read as literals so Next.js can inline them.
 * `process.env[name]` would not be substituted in a client bundle.
 */
function rawPublishable(env: StripeEnvironment): string | null {
  return clean(
    env === 'live'
      ? process.env.NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY
      : process.env.NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY,
  )
}

/**
 * Resolving a world's keys can turn up a key that is present but unusable. The
 * collector is how that reaches the hub without this module holding state:
 * `stripeKeysFor` throws the complaints away, `stripeKeyProblems` keeps them.
 */
type Collect = (variable: string, detail: string) => void

const IGNORE: Collect = () => {}

/**
 * One world's secret key: the world-specific variable if it is valid, else the
 * legacy single key when that key belongs to this world.
 */
function secretFor(env: StripeEnvironment, collect: Collect): string | null {
  const explicit = clean(env === 'live' ? process.env.STRIPE_LIVE_SECRET_KEY : process.env.STRIPE_TEST_SECRET_KEY)
  const variable = env === 'live' ? 'STRIPE_LIVE_SECRET_KEY' : 'STRIPE_TEST_SECRET_KEY'

  if (explicit) {
    const world = worldOfSecret(explicit)
    if (world === env) return explicit
    collect(
      variable,
      world
        ? `Holds a ${world}-mode key (${SECRET_PREFIX[world]}…), not a ${env}-mode one. Ignored — the key prefix decides, not the variable name.`
        : `Does not look like a Stripe secret key (expected ${SECRET_PREFIX[env]}…). Ignored.`,
    )
    return null
  }

  const legacy = clean(process.env.STRIPE_SECRET_KEY)
  if (legacy && worldOfSecret(legacy) === env) return legacy
  return null
}

function webhookSecretFor(env: StripeEnvironment, usingLegacySecret: boolean): string | null {
  const explicit = clean(
    env === 'live' ? process.env.STRIPE_LIVE_WEBHOOK_SECRET : process.env.STRIPE_TEST_WEBHOOK_SECRET,
  )
  if (explicit) return explicit
  // The legacy webhook secret belongs to whichever world the legacy key does —
  // there is only ever one of each, and they were set together.
  return usingLegacySecret ? clean(process.env.STRIPE_WEBHOOK_SECRET) : null
}

function publishableFor(env: StripeEnvironment, usingLegacySecret: boolean, collect: Collect): string | null {
  const explicit = rawPublishable(env)
  const variable =
    env === 'live'
      ? 'NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY'
      : 'NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY'

  if (explicit) {
    const world = worldOfPublishable(explicit)
    if (world === env) return explicit
    collect(
      variable,
      world
        ? `Holds a ${world}-mode publishable key (${PUBLISHABLE_PREFIX[world]}…), not a ${env}-mode one. Ignored.`
        : `Does not look like a Stripe publishable key (expected ${PUBLISHABLE_PREFIX[env]}…). Ignored.`,
    )
    return null
  }

  if (!usingLegacySecret) return null
  const legacy = clean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  return legacy && worldOfPublishable(legacy) === env ? legacy : null
}

function resolve(environment: StripeEnvironment, collect: Collect): StripeKeySet {
  const secretKey = secretFor(environment, collect)
  const usingLegacy = secretKey !== null && secretKey === clean(process.env.STRIPE_SECRET_KEY)
  return {
    environment,
    secretKey,
    webhookSecret: webhookSecretFor(environment, usingLegacy),
    publishableKey: publishableFor(environment, usingLegacy, collect),
  }
}

/** Every key for one world, whether or not that world is the selected one. */
export function stripeKeysFor(environment: StripeEnvironment): StripeKeySet {
  return resolve(environment, IGNORE)
}

/** True when this world has enough configured to charge a card. */
export function isStripeEnvironmentConfigured(environment: StripeEnvironment): boolean {
  return stripeKeysFor(environment).secretKey !== null
}

// ── Which world is selected ──────────────────────────────────────────────────
// Same shape as the payments-source override in `./index.ts`: a runtime value
// the Founders Hub sets, hydrated from the database by `syncPortalRuntime()`,
// winning over the environment so the switch needs no redeploy.

let _runtimeOverride: StripeEnvironment | null = null

export function setStripeEnvironmentOverride(env: StripeEnvironment | null): void {
  _runtimeOverride = env
}

export function getStripeEnvironmentOverride(): StripeEnvironment | null {
  return _runtimeOverride
}

/**
 * The selected Stripe world.
 *
 * Order: portal override → `STRIPE_ENVIRONMENT` → whichever world has keys →
 * `test`.
 *
 * The "whichever world has keys" step is what keeps a deployment that predates
 * this module working: its one `sk_live_…` was already the live configuration,
 * and defaulting such a deployment to `test` would quietly stop it charging
 * anybody. It cannot arm live on its own — reaching it at all requires live
 * keys to be present and no test keys to exist alongside them.
 */
export function getStripeEnvironment(): StripeEnvironment {
  if (_runtimeOverride) return _runtimeOverride

  const raw = (process.env.STRIPE_ENVIRONMENT ?? '').trim().toLowerCase()
  if (raw === 'live') return 'live'
  if (raw === 'test' || raw === 'sandbox') return 'test'

  if (isStripeEnvironmentConfigured('test')) return 'test'
  if (isStripeEnvironmentConfigured('live')) return 'live'
  return 'test'
}

/** The keys the app should actually be using right now. */
export function activeStripeKeys(): StripeKeySet {
  return stripeKeysFor(getStripeEnvironment())
}

/** Complaints about keys that are present but unusable, across both worlds. */
export function stripeKeyProblems(): StripeKeyProblem[] {
  const found: StripeKeyProblem[] = []
  for (const environment of STRIPE_ENVIRONMENTS) {
    resolve(environment, (variable, detail) => found.push({ environment, variable, detail }))
  }
  return found
}
