import type { OAuthProfile } from '@/lib/db/users'

/** How a provider's callback arrives and how to drive its auth-code flow. */
export interface OAuthProvider {
  id: string
  /** Human label for the sign-in button ("Apple", "Continue with X"). */
  label: string
  /** True when the provider's env credentials are all present. */
  configured(): boolean
  /** X requires PKCE; most others don't. */
  usesPKCE?: boolean
  /** Apple returns via HTTP POST (form_post); the rest use GET. */
  callbackMethods: ('GET' | 'POST')[]
  /** Build the provider's authorization URL to redirect the user to. */
  authUrl(args: { origin: string; state: string; codeChallenge?: string }): string
  /** Exchange the callback for the user's profile, or null on failure. */
  exchange(args: {
    origin: string
    code: string
    codeVerifier?: string
    /** Parsed body for form_post callbacks (Apple's one-time `user` field). */
    form?: Record<string, string>
  }): Promise<OAuthProfile | null>
}

export type { OAuthProfile }
