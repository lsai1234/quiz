'use client'

import { useEffect, useState } from 'react'
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

  const wrap = 'min-h-screen flex flex-col items-center justify-center px-6 max-w-sm mx-auto text-center'
  const input = 'w-full px-4 py-3.5 rounded-2xl text-sm outline-none'
  const inputStyle = { background: 'var(--surface-2)', border: '1px solid var(--edge)', color: 'var(--ink-1)' } as const

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
        <input
          type="password"
          autoComplete="new-password"
          placeholder="New password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null) }}
          className={input}
          style={inputStyle}
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="Type it again"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setError(null) }}
          className={input}
          style={inputStyle}
        />

        {tooShort && <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>At least 10 characters.</p>}
        {mismatch && <p className="text-[11px]" style={{ color: '#f87171' }}>Those don’t match.</p>}
        {error && <p className="text-xs font-semibold" style={{ color: '#f87171' }}>{error}</p>}

        <button
          type="submit"
          disabled={!valid || saving || !name}
          className="w-full py-3.5 rounded-2xl text-sm font-bold active:scale-95 transition-all disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'var(--ground-base)', fontFamily: 'var(--font-display)' }}
        >
          {saving ? 'Setting it…' : name ? 'Set password & sign in' : 'Checking your link…'}
        </button>
      </form>
    </div>
  )
}
