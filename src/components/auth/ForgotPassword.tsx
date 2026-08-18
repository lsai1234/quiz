'use client'

import { useState } from 'react'
import { Button, Input, Note } from '@/components/system'
import { requestPasswordReset } from '@/lib/auth-client'
import { tint } from '@/lib/ui/tokens'

/**
 * Asking for a reset link.
 *
 * One component for every sign-in journey — the hub's own screen and the account
 * gate that opens over checkout — because the copy here is load-bearing and two
 * copies of it would eventually disagree. The gate wraps it in a Sheet; the hub
 * renders it in place of the sign-in form. Nothing here knows which.
 *
 * ── What it will not say ─────────────────────────────────────────────────────
 * The confirmation is "if we have an account for that address". Never "we've
 * sent you an email", never "no account with that address", and it looks
 * identical whichever it was. The server is careful not to distinguish those
 * cases (see `/api/auth/forgot-password`); a screen that helpfully reports the
 * difference throws that away, and turns this form into a way of asking the site
 * whether a given person is a customer.
 *
 * It also does not clear itself back to the form on success. Someone who tapped
 * the button and saw the screen reset would reasonably tap it again — which is
 * how a person burns their own throttle and then has nothing to open.
 */
export function ForgotPassword({
  initialEmail = '',
  onBack,
  backLabel = 'Back to sign in',
}: {
  initialEmail?: string
  onBack: () => void
  backLabel?: string
}) {
  const [email, setEmail] = useState(initialEmail)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const valid = /\S+@\S+\.\S+/.test(email)

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const err = await requestPasswordReset(email.trim())
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    setSent(true)
  }

  const inputClass =
    'w-full px-4 py-3.5 min-h-13 rounded-2xl text-sm outline-none transition-all duration-200 ' +
    'focus-visible:ring-2 focus:border-[color:var(--accent)]'
  const inputStyle = {
    background: 'var(--surface-1)',
    border: `1px solid var(--edge)`,
    color: 'var(--ink-1)',
    ['--tw-ring-color' as string]: tint('var(--accent)', 45),
  }

  if (sent) {
    return (
      <div className="w-full space-y-4 text-left">
        <Note icon="check" live="polite">
          If we have an account for <strong>{email.trim()}</strong>, a link to set a new password is on
          its way. It works once, for the next 60 minutes.
        </Note>
        <p className="text-xs text-[var(--ink-3)] leading-relaxed px-1">
          Nothing yet? Check the spam folder before asking for another — a second link cancels the
          first, and they arrive in the order they were sent, not the order you asked.
        </p>
        <Button variant="secondary" onClick={onBack}>
          {backLabel}
        </Button>
      </div>
    )
  }

  return (
    <div className="w-full space-y-3 text-left">
      <p className="text-xs text-[var(--ink-3)] leading-relaxed px-1">
        Type the email address on your account and we’ll send a link to set a new password. Signing in
        with Google works too — a reset just adds a password alongside it.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        className="space-y-3"
      >
        <Input
          label="Email address"
          hideLabel
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setError(null)
          }}
        />

        {/* `assertive`: they pressed the button and are waiting on the answer,
            so interrupting is what they want. The success note above is
            `polite` — it is an outcome, not a failure. */}
        {error && (
          <Note icon="alert-triangle" tone="critical" live="assertive">
            {error}
          </Note>
        )}

        <Button type="submit" variant="primary" disabled={!valid || busy}>
          {busy ? 'Sending…' : 'Email me a link'}
        </Button>
      </form>

      <Button variant="ghost" size="sm" fullWidth={false} onClick={onBack} className="underline">
        {backLabel}
      </Button>
    </div>
  )
}
