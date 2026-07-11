'use client'

/**
 * OAuth sign-in buttons for every configured provider. Used by the hub login
 * and the checkout account gate. Each button is a plain link to
 * `/api/auth/<id>?returnTo=…` — the full-page redirect is intentional (OAuth).
 */

interface Provider {
  id: string
  label: string
}

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
  twitter: (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.46l8.6-9.83L0 1.15h7.6l5.24 6.93 6.06-6.93zm-1.29 19.5h2.04L6.49 3.24H4.3L17.61 20.65z" />
    </svg>
  ),
}

export function ProviderButtons({
  providers,
  returnTo,
  beforeNavigate,
}: {
  providers: Provider[]
  returnTo?: string
  /** Runs before the OAuth redirect (e.g. stash the pending checkout). If it
   *  throws, navigation is aborted. */
  beforeNavigate?: () => Promise<void>
}) {
  if (providers.length === 0) return null
  const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''

  const className =
    'w-full py-3.5 rounded-2xl text-sm font-bold tracking-wide active:scale-95 transition-all flex items-center justify-center gap-2.5'
  const style = {
    fontFamily: 'var(--font-display)',
    background: 'var(--color-surface-2)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text)',
  } as const

  const go = async (id: string) => {
    try {
      if (beforeNavigate) await beforeNavigate()
      window.location.href = `/api/auth/${id}${query}`
    } catch {
      /* leave the user on the gate if the pre-step failed */
    }
  }

  return (
    <div className="w-full space-y-2 mt-3">
      {providers.map((p) =>
        beforeNavigate ? (
          <button key={p.id} type="button" onClick={() => void go(p.id)} className={className} style={style}>
            {ICONS[p.id]}
            Continue with {p.label}
          </button>
        ) : (
          <a key={p.id} href={`/api/auth/${p.id}${query}`} className={className} style={style}>
            {ICONS[p.id]}
            Continue with {p.label}
          </a>
        ),
      )}
    </div>
  )
}
