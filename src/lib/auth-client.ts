'use client'

/** Browser-side helpers for the account APIs, shared by the hub and the
 *  checkout account gate. */

export interface AuthContext {
  user: { id: string; email: string | null; name: string } | null
  providers: { id: string; label: string }[]
  /** Whether an email provider is configured, i.e. whether a reset link can be sent. */
  canResetPassword: boolean
}

export async function fetchAuthContext(): Promise<AuthContext> {
  try {
    const res = await fetch('/api/auth/me')
    if (!res.ok) return { user: null, providers: [], canResetPassword: false }
    const data = (await res.json()) as Partial<AuthContext>
    return {
      user: data.user ?? null,
      providers: data.providers ?? [],
      canResetPassword: data.canResetPassword ?? false,
    }
  } catch {
    return { user: null, providers: [], canResetPassword: false }
  }
}

/**
 * Ask for a reset link. Resolves to an error message, or null when the request
 * was accepted.
 *
 * "Accepted" deliberately does not mean "an email was sent" — the server answers
 * the same way for an address it has never seen, and the UI must not imply
 * otherwise. See `/api/auth/forgot-password`.
 */
export async function requestPasswordReset(email: string): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.ok) return null
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return data.error ?? 'Something went wrong — try again'
  } catch {
    return 'Network error — try again'
  }
}

/** Sign in / create an account with email + password. Resolves to an error
 *  message, or null on success (the session cookie is set server-side). */
export async function authenticateAccount(
  mode: 'login' | 'signup',
  email: string,
  password: string,
): Promise<string | null> {
  try {
    const res = await fetch(`/api/auth/${mode === 'signup' ? 'signup' : 'login'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = (await res.json()) as { user?: unknown; error?: string }
    if (!res.ok || !data.user) return data.error ?? 'Something went wrong — try again'
    return null
  } catch {
    return 'Network error — try again'
  }
}
