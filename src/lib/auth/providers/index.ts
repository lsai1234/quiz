/**
 * OAuth provider registry. Adding a provider = drop a module here and register
 * it; the generic `/api/auth/[provider]` routes and the sign-in UI pick it up
 * automatically. Each is env-gated via its own `configured()`, so an
 * unconfigured provider costs nothing and shows nowhere.
 *
 * **Array order is UI order.** The sign-in surfaces render the configured
 * providers in this sequence and fold everything past the first few away, so
 * the order is a judgement about which account a customer is most likely to
 * already have — most-reached-for first, niche last — not alphabetical.
 */
import type { OAuthProvider } from './types'
import { google } from './google'
import { apple } from './apple'
import { facebook } from './facebook'
import { microsoft } from './microsoft'
import { amazon } from './amazon'
import { twitter } from './twitter'
import { discord } from './discord'
import { linkedin } from './linkedin'
import { github } from './github'

export const PROVIDERS: OAuthProvider[] = [
  google,
  apple,
  facebook,
  microsoft,
  amazon,
  twitter,
  discord,
  linkedin,
  github,
]

export function getProvider(id: string): OAuthProvider | undefined {
  return PROVIDERS.find((p) => p.id === id)
}

/** Providers whose credentials are configured — what the UI should show. */
export function configuredProviders(): { id: string; label: string }[] {
  return PROVIDERS.filter((p) => p.configured()).map((p) => ({ id: p.id, label: p.label }))
}

export type { OAuthProvider }
export type { OAuthProfile } from './types'
