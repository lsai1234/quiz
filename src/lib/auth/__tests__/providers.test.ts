/**
 * The provider registry, and the one security decision inside it.
 *
 * Everything a provider does flows into `upsertOAuthUser`, which merges a
 * sign-in into an existing account whenever the profile says the email is
 * verified. That makes `emailVerified` the load-bearing field on this whole
 * surface: get it wrong for one provider and someone signs in with an address
 * they don't own and lands in somebody else's subscription.
 */
import { PROVIDERS, getProvider, configuredProviders } from '@/lib/auth/providers'
import { microsoftEmailVerified } from '@/lib/auth/providers/microsoft'

const CONSUMER_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad'

const ENV_KEYS = [
  'GOOGLE', 'FACEBOOK', 'MICROSOFT', 'AMAZON', 'TWITTER', 'DISCORD', 'LINKEDIN', 'GITHUB',
] as const

describe('the provider registry', () => {
  const saved = { ...process.env }
  afterEach(() => { process.env = { ...saved } })

  it('gives every provider a unique id, and finds each by it', () => {
    const ids = PROVIDERS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(getProvider(id)?.id).toBe(id)
  })

  it('offers nothing it has no credentials for', () => {
    for (const key of ENV_KEYS) {
      delete process.env[`${key}_CLIENT_ID`]
      delete process.env[`${key}_CLIENT_SECRET`]
    }
    delete process.env.APPLE_CLIENT_ID
    expect(configuredProviders()).toEqual([])
  })

  it('shows a provider the moment both halves of its credentials are set', () => {
    for (const key of ENV_KEYS) {
      delete process.env[`${key}_CLIENT_ID`]
      delete process.env[`${key}_CLIENT_SECRET`]
    }
    delete process.env.APPLE_CLIENT_ID

    process.env.MICROSOFT_CLIENT_ID = 'id'
    expect(configuredProviders()).toEqual([]) // half a credential is no credential

    process.env.MICROSOFT_CLIENT_SECRET = 'secret'
    expect(configuredProviders()).toEqual([{ id: 'microsoft', label: 'Microsoft' }])
  })

  it('lists providers in registry order, most-reached-for first', () => {
    for (const key of ENV_KEYS) {
      process.env[`${key}_CLIENT_ID`] = 'id'
      process.env[`${key}_CLIENT_SECRET`] = 'secret'
    }
    delete process.env.APPLE_CLIENT_ID
    expect(configuredProviders().map((p) => p.id)).toEqual([
      'google', 'facebook', 'microsoft', 'amazon', 'twitter', 'discord', 'linkedin', 'github',
    ])
  })

  it('sends every provider back to its own callback, carrying the state', () => {
    for (const provider of PROVIDERS) {
      // Apple's authUrl needs its signing key; the rest only need the id.
      if (provider.id === 'apple') continue
      process.env[`${provider.id === 'twitter' ? 'TWITTER' : provider.id.toUpperCase()}_CLIENT_ID`] = 'id'
      const url = new URL(provider.authUrl({ origin: 'https://getchrgd.co.uk', state: 'abc123', codeChallenge: 'xyz' }))
      expect(url.searchParams.get('redirect_uri')).toBe(
        `https://getchrgd.co.uk/api/auth/${provider.id}/callback`,
      )
      expect(url.searchParams.get('state')).toBe('abc123')
      expect(url.searchParams.get('client_id')).toBe('id')
    }
  })
})

describe('whether Microsoft has actually vouched for an address', () => {
  it('trusts a personal Microsoft account', () => {
    expect(microsoftEmailVerified({ email: 'sam@outlook.com', tid: CONSUMER_TENANT })).toBe(true)
  })

  it('refuses a work-tenant address the tenant has not proved it owns', () => {
    // The takeover: an admin puts a Gmail address they don't own on a user in
    // their own tenant. Linking on that would hand them the Google account's
    // subscription.
    expect(microsoftEmailVerified({ email: 'someone@gmail.com', tid: 'some-company-tenant' })).toBe(false)
  })

  it('trusts a work address once the tenant proves the domain', () => {
    expect(
      microsoftEmailVerified({ email: 'sam@company.com', tid: 'some-company-tenant', xms_edov: true }),
    ).toBe(true)
    expect(
      microsoftEmailVerified({ email: 'sam@company.com', tid: 'some-company-tenant', xms_edov: 'true' }),
    ).toBe(true)
  })

  it('has nothing to verify when no address came back at all', () => {
    expect(microsoftEmailVerified({ tid: CONSUMER_TENANT })).toBe(false)
  })
})
