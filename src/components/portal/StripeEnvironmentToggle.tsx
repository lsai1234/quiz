'use client'

import { useEffect, useState } from 'react'
import { Badge, Button, Modal, ModalHeader, ModalBody, ModalFooter, Note, OptionRow } from '@/components/system'

/**
 * Test keys or live keys — the second Stripe switch.
 *
 * `IntegrationToggle` above it answers "does checkout charge anybody?". This
 * answers "in which Stripe account?", and the two are kept apart on screen for
 * the same reason they are kept apart in the store: dropping back to mock for an
 * afternoon should not also lose which world you were in.
 *
 * ── Why live has a confirmation and mock does not ───────────────────────────
 * Every other toggle in this hub is instant, and that is right: they are all
 * reversible before anything happens. This one is not symmetrical. Going back to
 * test costs nothing; going to live means the next person through checkout is
 * charged real money, and a stray tap is not a decision. So the live direction
 * gets a dialog naming the consequence, and the test direction stays instant —
 * the way back from a mistake should never be the slower path.
 *
 * The button for a world with no keys is disabled rather than hidden, with the
 * missing variable named. Hiding it would leave a founder wondering where live
 * mode went; the server refuses the same switch anyway (409), so this is the
 * explanation rather than the enforcement.
 */

type Environment = 'test' | 'live'

interface EnvironmentInfo {
  environment: Environment
  hasSecretKey: boolean
  hasWebhookSecret: boolean
  hasPublishableKey: boolean
  secretKeyTail: string | null
}

interface KeyProblem {
  environment: Environment
  variable: string
  detail: string
}

interface State {
  environment: Environment
  environments: EnvironmentInfo[]
  paymentSource: 'mock' | 'stripe'
  world: 'mock' | 'sandbox' | 'live'
  problems: KeyProblem[]
}

const COPY: Record<Environment, { label: string; sub: string; variable: string }> = {
  test: {
    label: 'Test mode',
    sub: 'Real Stripe, fake money. Card 4242 4242 4242 4242 goes through; nobody is charged.',
    variable: 'STRIPE_TEST_SECRET_KEY',
  },
  live: {
    label: 'Live mode',
    sub: 'Real cards, real money, real customers. Everything here appears on your Stripe payouts.',
    variable: 'STRIPE_LIVE_SECRET_KEY',
  },
}

export function StripeEnvironmentToggle({ endpoint = '/api/portal/stripe-environment' }: { endpoint?: string }) {
  const [data, setData] = useState<State | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    fetch(endpoint)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {})
  }, [endpoint])

  async function apply(environment: Environment) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment }),
      })
      const payload = await res.json().catch(() => null)
      if (res.ok && payload) setData(payload)
      else setError(payload?.error ?? 'Could not switch environments.')
    } catch {
      setError('Could not reach the server.')
    } finally {
      setSaving(false)
      setConfirming(false)
    }
  }

  function choose(environment: Environment) {
    if (environment === data?.environment) return
    if (environment === 'live') setConfirming(true)
    else void apply(environment)
  }

  if (!data) return <p className="text-sm text-[var(--ink-3)]">Loading…</p>

  const info = (env: Environment) => data.environments.find((e) => e.environment === env)
  const selected = info(data.environment)
  const live = data.world === 'live'
  const charging = data.paymentSource === 'stripe'

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Stripe environment" className="space-y-2">
        {(['test', 'live'] as Environment[]).map((env) => {
          const detail = info(env)
          const configured = detail?.hasSecretKey ?? false
          return (
            <OptionRow
              key={env}
              role="radio"
              selected={data.environment === env}
              disabled={saving || !configured}
              icon={env === 'live' ? 'bolt' : 'flask'}
              label={
                <span className="inline-flex items-center" style={{ gap: 'var(--space-2)' }}>
                  {COPY[env].label}
                  {configured ? (
                    detail?.secretKeyTail && <Badge tone="neutral">…{detail.secretKeyTail}</Badge>
                  ) : (
                    <Badge tone="neutral">No key</Badge>
                  )}
                </span>
              }
              sub={
                configured ? (
                  <>
                    {COPY[env].sub}
                    {!detail?.hasWebhookSecret && (
                      <>
                        {' '}
                        <span style={{ color: 'var(--tone-attention)' }}>
                          No webhook secret — orders would never be marked paid.
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  <>Set <code>{COPY[env].variable}</code> to use this.</>
                )
              }
              onClick={() => choose(env)}
            />
          )
        })}
      </div>

      {data.problems.map((p) => (
        <Note key={`${p.variable}-${p.detail}`} tone="critical" icon="alert-triangle">
          <strong>{p.variable}</strong> — {p.detail}
        </Note>
      ))}

      <Note tone={live ? 'attention' : 'neutral'} icon={live ? 'bolt' : 'info'}>
        {charging ? (
          <>
            Checkout is charging in <strong>{live ? 'live' : 'test'} mode</strong>
            {selected?.secretKeyTail && <> with the key ending …{selected.secretKeyTail}</>}.{' '}
            {live
              ? 'Real cards are being charged.'
              : 'Nobody is charged real money.'}
          </>
        ) : (
          <>
            Payments are on <strong>mock</strong>, so this choice is not charging anybody yet — it is
            the world checkout will use once payments are switched to Stripe above.
          </>
        )}{' '}
        Applies on the next request — no redeploy needed.
      </Note>

      {error && (
        <Note tone="critical" icon="alert-triangle" live="assertive">
          {error}
        </Note>
      )}

      {confirming && (
        <Modal onClose={() => setConfirming(false)} size="sm">
          <ModalHeader title="Switch to live Stripe?" />
          <ModalBody>
            <div className="space-y-3">
              <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-2)', lineHeight: 'var(--leading-loose)' }}>
                The next customer through checkout will be charged real money on a real card, and
                every order and subscription created from here is stamped <strong>live</strong> — the
                go-live reset refuses to delete those, on purpose.
              </p>
              {!info('live')?.hasWebhookSecret && (
                <Note tone="critical" icon="alert-triangle">
                  No live webhook signing secret is set. Cards would be charged and no order would
                  ever be marked paid. Set <code>STRIPE_LIVE_WEBHOOK_SECRET</code> first.
                </Note>
              )}
              <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>
                You can switch back to test mode at any time — instantly, and without confirmation.
              </p>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void apply('live')}>
              Go live
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}
