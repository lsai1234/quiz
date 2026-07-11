'use client'

/** Browser-side helpers for the account APIs, shared by the hub and the
 *  checkout account gate. */

export interface AuthContext {
  user: { id: string; email: string | null; name: string } | null
  providers: { id: string; label: string }[]
}

export async function fetchAuthContext(): Promise<AuthContext> {
  try {
    const res = await fetch('/api/auth/me')
    if (!res.ok) return { user: null, providers: [] }
    return (await res.json()) as AuthContext
  } catch {
    return { user: null, providers: [] }
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
