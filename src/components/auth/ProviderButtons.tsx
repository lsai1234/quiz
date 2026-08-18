'use client'

import { useState } from 'react'
import { Button, Note, buttonSurface } from '@/components/system'

/**
 * OAuth sign-in buttons for every configured provider. Used by the hub login
 * and the checkout account gate. Each button is a plain link to
 * `/api/auth/<id>?returnTo=…` — the full-page redirect is intentional (OAuth).
 *
 * Beyond four configured providers the list folds: the first three stay on
 * screen and the rest sit behind "More ways to sign in". The checkout gate is a
 * modal at the last step before payment, and a column of nine buttons there
 * pushes the thing they came to do off the bottom of a phone.
 *
 * ── When there is a pre-step ─────────────────────────────────────────────────
 * With `beforeNavigate` these stop being links and become buttons, and a button
 * that can decline to navigate has to say so. It reports both halves: the
 * clicked button goes busy for as long as the pre-step runs, and if the pre-step
 * refuses, the caller's `error` is printed directly under the buttons — where
 * the finger already is, not at the bottom of a scrolling sheet.
 */

interface Provider {
  id: string
  label: string
}

/** How many stay visible when the list is folded. */
const PRIMARY_COUNT = 3

const ICONS: Record<string, React.ReactNode> = {
  google: (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  ),
  apple: (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M17.05 12.5c-.03-2.5 2.04-3.7 2.13-3.76-1.16-1.7-2.97-1.93-3.61-1.96-1.54-.15-3 .9-3.78.9-.77 0-1.97-.88-3.24-.86-1.67.02-3.21.97-4.07 2.46-1.73 3-.44 7.45 1.25 9.89.82 1.19 1.8 2.53 3.08 2.48 1.24-.05 1.7-.8 3.2-.8 1.48 0 1.9.8 3.2.77 1.32-.02 2.16-1.21 2.97-2.41.94-1.38 1.32-2.71 1.34-2.78-.03-.01-2.57-.99-2.6-3.92zM14.6 4.87c.68-.83 1.14-1.98 1.02-3.12-.98.04-2.17.65-2.88 1.48-.63.73-1.19 1.9-1.04 3.02 1.09.08 2.21-.55 2.9-1.38z" />
    </svg>
  ),
  facebook: (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#1877F2" d="M24 12c0-6.63-5.37-12-12-12S0 5.37 0 12c0 5.99 4.39 10.95 10.13 11.85v-8.38H7.08V12h3.05V9.36c0-3 1.79-4.67 4.53-4.67 1.31 0 2.68.24 2.68.24v2.95h-1.51c-1.49 0-1.95.92-1.95 1.87V12h3.32l-.53 3.47h-2.79v8.38C19.61 22.95 24 17.99 24 12z" />
    </svg>
  ),
  microsoft: (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#F25022" d="M0 0h11.4v11.4H0z" />
      <path fill="#7FBA00" d="M12.6 0H24v11.4H12.6z" />
      <path fill="#00A4EF" d="M0 12.6h11.4V24H0z" />
      <path fill="#FFB900" d="M12.6 12.6H24V24H12.6z" />
    </svg>
  ),
  twitter: (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.46l8.6-9.83L0 1.15h7.6l5.24 6.93 6.06-6.93zm-1.29 19.5h2.04L6.49 3.24H4.3L17.61 20.65z" />
    </svg>
  ),
  linkedin: (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#0A66C2" />
      <path
        fill="#fff"
        d="M7.2 9.4H4.8v9.4h2.4V9.4zM6 5.2a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zM19.2 13.4c0-2.6-1.4-3.8-3.2-3.8-1.5 0-2.2.8-2.5 1.4V9.4H11.1c.03.7 0 9.4 0 9.4h2.4v-5.2c0-.3 0-.5.1-.7.2-.5.6-1 1.4-1 1 0 1.4.8 1.4 1.9v5h2.4v-5.4z"
      />
    </svg>
  ),
}

/**
 * The fallback mark: the brand's initial in its own colour.
 *
 * Deliberately not a hand-drawn approximation of a logo — a nearly-right
 * Amazon swoosh or GitHub octocat looks broken in a way a clean monogram never
 * does, and any provider added later gets a presentable button for free.
 */
const MONOGRAM_COLOURS: Record<string, string> = {
  amazon: '#FF9900',
  discord: '#5865F2',
  github: '#8b949e',
}

function Monogram({ id, label }: { id: string; label: string }) {
  const colour = MONOGRAM_COLOURS[id] ?? 'var(--ink-3)'
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center rounded-[4px] text-[11px] font-black"
      style={{ width: 16, height: 16, background: colour, color: '#0b0b0d', fontFamily: 'var(--font-display)' }}
    >
      {label.charAt(0).toUpperCase()}
    </span>
  )
}

export function ProviderButtons({
  providers,
  returnTo,
  beforeNavigate,
  error,
}: {
  providers: Provider[]
  returnTo?: string
  /** Runs before the OAuth redirect (e.g. stash the pending checkout). If it
   *  throws, navigation is aborted. */
  beforeNavigate?: () => Promise<void>
  /** Why the last attempt stayed put, shown under the buttons. Owned by the
   *  caller because the caller owns `beforeNavigate` and knows what it refused. */
  error?: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  if (providers.length === 0) return null

  const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''
  // Fold only when it actually saves a row — hiding one button behind a button
  // that reveals it is worse than showing it.
  const folded = providers.length > PRIMARY_COUNT + 1 && !expanded
  const visible = folded ? providers.slice(0, PRIMARY_COUNT) : providers

  // The anchor form has to look identical to the button form — a member cannot
  // tell which one they are getting, and should not be able to.
  const linkSurface = buttonSurface('secondary', 'lg')

  const go = async (id: string) => {
    if (pending) return
    setPending(id)
    try {
      if (beforeNavigate) await beforeNavigate()
      window.location.href = `/api/auth/${id}${query}`
      // Stays busy on purpose: the page is on its way out, and handing the
      // button back invites a second tap that starts a second sign-in.
    } catch {
      // Leave them on the gate — the caller says why, via `error`.
      setPending(null)
    }
  }

  return (
    <div className="w-full space-y-2 mt-3">
      {visible.map((p) => {
        const icon = ICONS[p.id] ?? <Monogram id={p.id} label={p.label} />
        const busy = pending === p.id
        return beforeNavigate ? (
          // `loading` carries the busy state, the block on a second press and
          // the spinner in one prop — this used to dim the other buttons by
          // hand and say nothing about being busy beyond `aria-busy`.
          <Button
            key={p.id}
            size="lg"
            fullWidth
            loading={busy}
            disabled={pending !== null}
            onClick={() => void go(p.id)}
          >
            {icon}
            {busy ? `Taking you to ${p.label}…` : `Continue with ${p.label}`}
          </Button>
        ) : (
          // A real link when there is no pre-step: OAuth is a full-page
          // redirect, and a link is what can be middle-clicked and what
          // announces itself as going somewhere.
          <a
            key={p.id}
            href={`/api/auth/${p.id}${query}`}
            {...linkSurface}
            className={`${linkSurface.className} w-full`}
          >
            {icon}
            Continue with {p.label}
          </a>
        )
      })}

      {/* Was a hardcoded `#ff6b6b` — the second, differently-wrong red the audit
          found. Tone rather than colour now. */}
      {error && (
        <Note icon="alert-triangle" tone="critical" live="assertive">
          {error}
        </Note>
      )}

      {folded && (
        <Button variant="ghost" size="sm" fullWidth onClick={() => setExpanded(true)}>
          More ways to sign in ({providers.length - PRIMARY_COUNT})
        </Button>
      )}
    </div>
  )
}
