'use client'

import { useEffect, useState } from 'react'
import { Button, Input, Note } from '@/components/system'
import { useSearchParams } from 'next/navigation'

/**
 * Setting a password from an invite link.
 *
 * The link is the credential, and it is single-use. Looking up whose it is does
 * NOT spend it — a page load must not be able to burn an invite, or a preview
 * fetch in an email client would lock a partner out of their own account before
 * they ever clicked.
 */
export function SetPassword() {
  const params = useSearchParams()
  const token = params.get('token') ?? ''

  const [name, setName] = useState<string | null>(null)
  const [dead, setDead] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!token) {
      setDead('That link is missing its token. Use the one we emailed you.')
      return
    }
    fetch(`/api/partner/set-password?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (r.ok) setName(d.name)
        else setDead(d.error ?? 'That link has expired or has already been used.')
      })
      .catch(() => setDead('Could not reach us — check your connection and try again.'))
  }, [token])

  const tooShort = password.length > 0 && password.length < 10
  const mismatch = confirm.length > 0 && confirm !== password
  const valid = password.length >= 10 && confirm === password

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/partner/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        // Straight into the dashboard — they have just proved they hold the
        // invite and chosen a password; asking them to type it again now is
        // friction for nothing.
        window.location.href = '/partner'
        return
      }
      setError(d.error ?? 'That did not work.')
    } catch {
      setError('Could not reach us — check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  // `my-hub` on the wrapper: signed out, this screen IS the region, and the
  // password fields guarding a partner account are exactly the controls the
  // focus floor must not miss. Same reason `PortalLogin` carries `founder-hub`.
  const wrap =
    'my-hub min-h-screen flex flex-col items-center justify-center px-6 max-w-sm mx-auto text-center'

  if (dead) {
    return (
      <div className={wrap} style={{ background: 'var(--ground-base)' }}>
        <h1 className="text-2xl font-black mb-2" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
          This link won’t work
        </h1>
        <p className="text-xs text-[var(--ink-3)] leading-snug mb-6">{dead}</p>
        <a href="/partner" className="text-xs font-bold underline" style={{ color: 'var(--accent)' }}>
          Go to sign-in
        </a>
      </div>
    )
  }

  return (
    <div className={wrap} style={{ background: 'var(--ground-base)' }}>
      <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>
        CHRGD Partners
      </p>
      <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
        {name ? `Welcome, ${name.split(' ')[0]}` : 'Set your password'}
      </h1>
      <p className="text-xs text-[var(--ink-3)] mb-6 leading-snug">
        Choose a password and you’re in. This link only works once.
      </p>

      <form onSubmit={submit} className="w-full space-y-3">
        {/* The rules land on the field itself: `hint` while it is fine, `error`
            when it is not, both wired through `aria-describedby`. They used to
            be loose paragraphs underneath that nothing pointed at. */}
        <Input
          label="New password"
          hideLabel
          type="password"
          autoComplete="new-password"
          placeholder="New password"
          hint="At least 10 characters."
          error={tooShort ? 'At least 10 characters.' : undefined}
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null) }}
        />
        <Input
          label="Confirm new password"
          hideLabel
          type="password"
          autoComplete="new-password"
          placeholder="Type it again"
          error={mismatch ? 'Those don’t match.' : undefined}
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setError(null) }}
        />

        {/* Was `#f87171` — the fourth hardcoded red in this codebase, and the
            third distinct value claiming to be the same colour. */}
        {error && (
          <Note icon="alert-triangle" tone="critical" live="assertive">
            {error}
          </Note>
        )}

        <Button type="submit" variant="primary" size="lg" fullWidth loading={saving} disabled={!valid || !name}>
          {name ? 'Set password & sign in' : 'Checking your link…'}
        </Button>
      </form>
    </div>
  )
}
