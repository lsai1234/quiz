'use client'

import { useEffect, useState } from 'react'
import { Eyebrow } from '@/components/hub/Eyebrow'
import { Button, Input, Note } from '@/components/system'
import { CHRGDMark } from '@/components/brand/CHRGDLogo'
import { tint } from '@/lib/ui/tokens'

/** Kept in step with `passwordProblem` on the server, which is the real gate. */
const MIN_LENGTH = 8

/**
 * Setting a new password from an emailed link.
 *
 * Three things this screen does that are easy to leave out:
 *
 * **It checks the link before anyone types.** A `GET` resolves whose link it is
 * without spending it, so an expired one says so immediately rather than after
 * someone has chosen a password and typed it twice. Looking is deliberately not
 * spending — an email client that prefetches URLs would otherwise burn the link
 * before its owner ever saw it.
 *
 * **It takes the token out of the address bar** as soon as it has been read. A
 * live credential in a URL ends up in browser history, in a screenshot, and in
 * the `Referer` header of anything the page loads next. It stays in memory for
 * the one request that needs it.
 *
 * **It signs them in.** They have just proved they hold the mailbox and chosen a
 * password; a sign-in form as the next screen is friction for nothing.
 */
export function ResetPassword() {
  const [token, setToken] = useState<string | null>(null)
  const [name, setName] = useState<string | null>(null)
  const [dead, setDead] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const fromUrl = params.get('token') ?? ''

    if (!fromUrl) {
      setDead('That link is missing its token. Use the one we emailed you, or ask for a new one.')
      return
    }

    setToken(fromUrl)
    const url = new URL(window.location.href)
    url.searchParams.delete('token')
    window.history.replaceState({}, '', `${url.pathname}${url.search}`)

    fetch(`/api/auth/reset-password?token=${encodeURIComponent(fromUrl)}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { name?: string; error?: string }
        if (res.ok) setName(data.name ?? null)
        else setDead(data.error ?? 'That link has expired or has already been used.')
      })
      .catch(() => setDead('Could not reach us — check your connection and try again.'))
  }, [])

  const tooShort = password.length > 0 && password.length < MIN_LENGTH
  const mismatch = confirm.length > 0 && confirm !== password
  const valid = password.length >= MIN_LENGTH && confirm === password

  const submit = async () => {
    if (!valid || saving || !token) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (res.ok) {
        // A full navigation rather than a router push: the session cookie was
        // just set server-side, and the hub should load knowing about it.
        window.location.href = '/myhub'
        return
      }
      setError(data.error ?? 'That did not work.')
      setSaving(false)
    } catch {
      setError('Could not reach us — check your connection and try again.')
      setSaving(false)
    }
  }

  const wrap = 'min-h-[80vh] flex flex-col items-center justify-center px-6 max-w-sm mx-auto text-center'
  const inputClass =
    'w-full px-4 py-3.5 min-h-13 rounded-2xl text-sm outline-none transition-all duration-200 ' +
    'focus-visible:ring-2 focus:border-[color:var(--accent)]'
  const inputStyle = {
    background: 'var(--surface-1)',
    border: `1px solid var(--edge)`,
    color: 'var(--ink-1)',
    ['--tw-ring-color' as string]: tint('var(--accent)', 45),
  }

  if (dead) {
    return (
      <div className={wrap}>
        <CHRGDMark size={34} className="mb-5" />
        <h1
          className="text-2xl font-black mb-2"
          style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}
        >
          This link won’t work
        </h1>
        <p className="text-sm text-[var(--ink-3)] leading-relaxed mb-6">{dead}</p>
        {/* Straight back into the flow that issues a new one, rather than to a
            sign-in screen they already know they cannot get past. */}
        <Button variant="primary" onClick={() => { window.location.href = '/myhub?forgot=1' }}>
          Send me a new link
        </Button>
      </div>
    )
  }

  return (
    <div className={wrap}>
      <CHRGDMark size={34} className="mb-5" />
      <Eyebrow color="var(--accent)" className="mb-2">Subscriber hub</Eyebrow>
      <h1
        className="text-3xl font-black mb-2"
        style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}
      >
        {name ? `Welcome back, ${name.split(' ')[0]}` : 'Set a new password'}
      </h1>
      <p className="text-sm text-[var(--ink-3)] leading-relaxed mb-7">
        Choose a new password and you’re straight back in. This link only works once.
      </p>

      <form
        onSubmit={(e) => { e.preventDefault(); void submit() }}
        className="w-full space-y-3"
      >
        <Input
          label="New password"
          hideLabel
          type="password"
          autoComplete="new-password"
          placeholder={`New password (${MIN_LENGTH}+ characters)`}
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null) }}
        />
        <Input
          label="Confirm new password"
          hideLabel
          type="password"
          autoComplete="new-password"
          placeholder="Type it again"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setError(null) }}
        />

        {tooShort && (
          <p className="text-xs text-left px-1" style={{ color: 'var(--ink-3)' }}>
            At least {MIN_LENGTH} characters.
          </p>
        )}
        {mismatch && (
          <p className="text-xs font-semibold text-left px-1" style={{ color: 'var(--tone-critical)' }}>
            Those don’t match.
          </p>
        )}
        {error && (
          <p className="text-xs font-semibold text-left px-1" style={{ color: 'var(--tone-critical)' }} role="alert">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" disabled={!valid || saving || !name}>
          {saving ? 'Setting it…' : name ? 'Set password & sign in' : 'Checking your link…'}
        </Button>
      </form>

      <Note icon="lock" className="mt-6 text-left">
        Setting a new password signs you out everywhere else — on every device and every browser
        that was still signed in.
      </Note>
    </div>
  )
}
