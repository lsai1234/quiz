'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button, Card, Input, Note } from '@/components/system'

interface Joining {
  link: 'live' | 'dead'
  kind?: 'influencer' | 'affiliate'
  name?: string
  linkExpiresAt?: string
  hasPassword?: boolean
  code?: { code: string; discountPct: number } | null
  earn?: { commissionPct: number; wording: string } | null
}

const pct = (n: number) => `${Math.round(n * 100)}%`

/**
 * `/partner/join` — an affiliate's first sign-in.
 *
 * ── What this screen is for ─────────────────────────────────────────────────
 * An affiliate is signed up for two things: a code to pass on, and a rate on
 * what it brings in. So the first thing they see is those two things, in the
 * numbers that are actually on their account — not a welcome paragraph that
 * could say anything, and not an agreement, because there isn't one. Then a
 * password, which is the only thing they have to do.
 *
 * ── Why it shows the deal before asking for anything ────────────────────────
 * The link arrives in a DM from someone they may have spoken to once. "Set a
 * password" as the first screen asks a stranger for a credential before telling
 * them what it is for. Their code and their rate ARE the answer to that, they
 * cost one read, and they are what the person will check first anyway.
 *
 * ── Why an influencer's link is sent away ───────────────────────────────────
 * Their front door is `/partner/claim`: a free stack, and an agreement to sign
 * for it. Neither exists here, and a page that silently dropped both would be
 * the wrong page rather than a shorter one. The hub hands out the right link
 * per programme; this is the backstop for one that was forwarded or edited.
 */
export function AffiliateJoin() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') ?? ''

  const [data, setData] = useState<Joining | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!token) {
      setData({ link: 'dead' })
      return
    }
    fetch(`/api/partner/join?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d: Joining) => {
        // Their programme's own door, with the link intact — reading it never
        // spent it, so this redirect costs them nothing.
        if (d.link === 'live' && d.kind === 'influencer') {
          // `replace`, not a new entry: Back should take them where they came
          // from rather than to a page that will only redirect them again.
          router.replace(`/partner/claim?token=${encodeURIComponent(token)}`)
          return
        }
        setData(d)
      })
      .catch(() => setError('Could not reach us — check your connection and try again.'))
  }, [token, router])

  const tooShort = password.length > 0 && password.length < 10
  const mismatch = confirm.length > 0 && confirm !== password
  const valid = password.length >= 10 && confirm === password

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || saving) return
    setSaving(true)
    setError(null)
    try {
      /*
        The shared endpoint, not one of this page's own. It burns the link
        before writing, drops every session the account held, and starts a new
        one — three steps that must stay in one place for both programmes.
      */
      const res = await fetch('/api/partner/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        /*
          A full load rather than a client navigation. A session cookie was just
          set, and `/partner` is server-rendered behind a gate that reads it —
          a soft navigation can render the signed-out shell from a cache that
          predates the cookie, which looks like the password not having worked.
        */
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
  // password fields guarding an account that earns money are exactly the
  // controls the focus floor must not miss. Same reason `SetPassword` does it.
  const wrap = 'my-hub min-h-screen flex flex-col items-center justify-center px-6 max-w-sm mx-auto'

  if (data?.link === 'dead') {
    return (
      <div className={`${wrap} text-center`} style={{ background: 'var(--ground-base)' }}>
        <h1 className="text-2xl font-black mb-2" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
          This link won’t work
        </h1>
        <p className="text-xs text-[var(--ink-3)] leading-snug mb-6">
          Sign-in links run out after a week. Ask us for a new one and it will take you straight in.
        </p>
        <a href="/partner" className="text-xs font-bold underline" style={{ color: 'var(--accent)' }}>
          Go to sign-in
        </a>
      </div>
    )
  }

  if (!data) {
    return (
      <div className={`${wrap} text-center`} style={{ background: 'var(--ground-base)' }}>
        <p className="text-xs text-[var(--ink-3)]">Checking your link…</p>
      </div>
    )
  }

  return (
    <div className={wrap} style={{ background: 'var(--ground-base)' }}>
      <div className="w-full text-center">
        <p
          className="text-[10px] font-bold tracking-widest uppercase mb-2"
          style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)' }}
        >
          CHRGD Affiliates
        </p>
        <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
          {data.name ? `Welcome, ${data.name.split(' ')[0]}` : 'Welcome'}
        </h1>
        <p className="text-xs text-[var(--ink-3)] mb-5 leading-snug">
          {data.hasPassword
            ? 'Your account is already set up — signing in again sets a new password.'
            : 'Your code is live. Pick a password and it’s all yours.'}
        </p>
      </div>

      {/* The deal, in the numbers actually on their account. */}
      {data.code && (
        <Card elevation={2} className="w-full mb-4 text-center">
          <p
            className="text-lg font-black tracking-wide px-3 py-1.5 rounded-xl inline-block"
            style={{ color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 14%, transparent)' }}
          >
            {data.code.code}
          </p>
          <p className="text-xs leading-snug mt-3" style={{ color: 'var(--ink-2)' }}>
            {pct(data.code.discountPct)} off for anyone who uses it
            {data.earn ? <>, and you earn {pct(data.earn.commissionPct)} of every order it brings in.</> : '.'}
          </p>
          {/*
            The rate in full, from the same sentence their hub will show them.
            Two places saying the deal slightly differently is how a partner
            ends up believing the more generous one.
          */}
          {data.earn && (
            <p className="text-[11px] leading-snug mt-2" style={{ color: 'var(--ink-3)' }}>
              {data.earn.wording} Paid monthly in arrears, once an order is past its returns window.
            </p>
          )}
        </Card>
      )}

      <form onSubmit={submit} className="w-full space-y-3">
        <Input
          label="Password"
          hideLabel
          type="password"
          autoComplete="new-password"
          placeholder="Pick a password"
          hint="At least 10 characters."
          error={tooShort ? 'At least 10 characters.' : undefined}
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null) }}
        />
        <Input
          label="Confirm password"
          hideLabel
          type="password"
          autoComplete="new-password"
          placeholder="Type it again"
          error={mismatch ? 'Those don’t match.' : undefined}
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setError(null) }}
        />

        {error && (
          <Note icon="alert-triangle" tone="critical" live="assertive">
            {error}
          </Note>
        )}

        <Button type="submit" variant="primary" size="lg" fullWidth loading={saving} disabled={!valid}>
          Set my password & go to my hub
        </Button>
      </form>

      <p className="text-[11px] text-[var(--ink-3)] leading-snug mt-4 text-center">
        Inside you’ll find what your code has brought in, what you’re owed and when it lands. Nothing to sign,
        nothing to post — just share the code.
      </p>
    </div>
  )
}
