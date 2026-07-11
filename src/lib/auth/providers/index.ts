/**
 * OAuth provider registry. Adding a provider = drop a module here and register
 * it; the generic `/api/auth/[provider]` routes and the sign-in UI pick it up
 * automatically. Each is env-gated via its own `configured()`.
 */
import type { OAuthProvider } from './types'
import { google } from './google'
import { apple } from './apple'
import { facebook } from './facebook'
import { twitter } from './twitter'

export const PROVIDERS: OAuthProvider[] = [google, apple, facebook, twitter]

export function getProvider(id: string): OAuthProvider | undefined {
  return PROVIDERS.find((p) => p.id === id)
}

/** Providers whose credentials are configured — what the UI should show. */
export function configuredProviders(): { id: string; label: string }[] {
  return PROVIDERS.filter((p) => p.configured()).map((p) => ({ id: p.id, label: p.label }))
}

export type { OAuthProvider }
export type { OAuthProfile } from './types'
