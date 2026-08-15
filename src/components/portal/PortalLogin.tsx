'use client'

import { useState } from 'react'
import { Button, Card, Ground, Input } from '@/components/system'
import type { FounderAuthMode } from '@/lib/portal/auth'

export function PortalLogin({ mode = 'demo' }: { mode?: FounderAuthMode }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Nothing is configured on a production deploy: no credentials exist, so the
  // form can only ever reject you. Say that instead of letting someone hunt for
  // a password problem that is really a missing environment variable.
  const unconfigured = mode === 'unconfigured'
  const valid = !unconfigured && /\S+@\S+\.\S+/.test(email) && password.length > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch('/api/portal/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    })
    if (res.ok) {
      window.location.reload()
    } else {
      setError('Incorrect email or password')
      setLoading(false)
    }
  }

  return (
    <Ground>
      <div
        className="min-h-screen flex flex-col items-center justify-center mx-auto"
        style={{ padding: 'var(--gutter)', maxWidth: '26rem' }}
      >
        <p
          style={{
            fontSize: 'var(--text-micro)',
            fontWeight: 'var(--weight-strong)',
            fontFamily: 'var(--font-display)',
            letterSpacing: 'var(--tracking-eyebrow)',
            textTransform: 'uppercase',
            color: 'var(--accent)',
          }}
        >
          CHRGD Founders Hub
        </p>
        <h1
          style={{
            fontSize: 'var(--text-hero)',
            fontWeight: 'var(--weight-display)',
            fontFamily: 'var(--font-display)',
            letterSpacing: 'var(--tracking-display)',
            lineHeight: 'var(--leading-tight)',
            color: 'var(--ink-1)',
            marginTop: 'var(--space-3)',
            marginBottom: 'var(--space-6)',
          }}
        >
          Founder sign-in
        </h1>

        <form onSubmit={submit} className="w-full flex flex-col" style={{ gap: 'var(--space-4)' }}>
          <Input
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@chrgd.dev"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={unconfigured}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={unconfigured}
            // The failure belongs to the pair, not to one field — saying which
            // half was wrong is exactly what a sign-in form must not do.
            error={error ?? undefined}
          />
          <Button type="submit" variant="primary" size="lg" fullWidth disabled={!valid} loading={loading}>
            {loading ? 'Signing in' : 'Sign in'}
          </Button>
        </form>

        {/* The demo credentials are only ever printed on a build that accepts
            them. On production this reads as a configuration notice instead. */}
        <div style={{ marginTop: 'var(--space-6)', width: '100%' }}>
          <Card
            elevation={1}
            padding="tight"
            tone={unconfigured ? 'attention' : 'accent'}
          >
            <p
              style={{
                fontSize: 'var(--text-meta)',
                lineHeight: 'var(--leading-loose)',
                color: 'var(--ink-2)',
              }}
            >
              {mode === 'demo' ? (
                <>
                  <strong>Development build.</strong> No <code>FOUNDER_*</code> accounts are set, so{' '}
                  <code>founder1@chrgd.dev</code> / <code>chrgd-founder-1</code> works. These never
                  work on a deployed build.
                </>
              ) : unconfigured ? (
                <>
                  <strong>No founder accounts are configured.</strong> Nobody can sign in until{' '}
                  <code>FOUNDER_1_EMAIL</code> and <code>FOUNDER_1_PASSWORD</code> are set in the
                  deployment&rsquo;s environment variables — <em>and the app is redeployed</em>, since
                  new variables don&rsquo;t reach a deployment that is already running.
                </>
              ) : (
                <>
                  <strong>Founders only.</strong> Accounts are configured via the{' '}
                  <code>FOUNDER_*</code> environment variables.
                </>
              )}
            </p>
          </Card>
        </div>
      </div>
    </Ground>
  )
}
