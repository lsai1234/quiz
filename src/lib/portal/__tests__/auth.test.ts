import { verifyFounder, founderForToken, isAuthed, listFounders, founderAuthMode, PORTAL_SESSION_TTL_MS } from '../auth'

describe('founder auth', () => {
  const original = { ...process.env }

  beforeEach(() => {
    process.env.FOUNDER_1_EMAIL = 'Ada@chrgd.dev'
    process.env.FOUNDER_1_PASSWORD = 'secret-1'
    process.env.FOUNDER_1_NAME = 'Ada'
    process.env.FOUNDER_2_EMAIL = 'grace@chrgd.dev'
    process.env.FOUNDER_2_PASSWORD = 'secret-2'
    delete process.env.FOUNDER_2_NAME
    delete process.env.ADMIN_PASSWORD
  })

  afterEach(() => {
    process.env = { ...original }
  })

  it('lists the configured founders without passwords', () => {
    const founders = listFounders()
    expect(founders).toHaveLength(2)
    expect(founders.map((f) => f.email)).toEqual(['ada@chrgd.dev', 'grace@chrgd.dev'])
    expect((founders[0] as unknown as Record<string, unknown>).password).toBeUndefined()
  })

  it('verifies correct credentials (case-insensitive email) and returns a token', () => {
    const result = verifyFounder('ADA@chrgd.dev', 'secret-1')
    expect(result).not.toBeNull()
    expect(result!.founder).toEqual({ email: 'ada@chrgd.dev', name: 'Ada' })
    expect(typeof result!.token).toBe('string')
    expect(result!.token.length).toBeGreaterThan(10)
  })

  it('defaults the name to the email local part when FOUNDER_n_NAME is unset', () => {
    expect(verifyFounder('grace@chrgd.dev', 'secret-2')!.founder.name).toBe('grace')
  })

  it('rejects a wrong password and an unknown email', () => {
    expect(verifyFounder('ada@chrgd.dev', 'nope')).toBeNull()
    expect(verifyFounder('stranger@chrgd.dev', 'secret-1')).toBeNull()
  })

  it('round-trips a token back to its founder and authorises it', () => {
    const { token, founder } = verifyFounder('ada@chrgd.dev', 'secret-1')!
    expect(founderForToken(token)).toEqual(founder)
    expect(isAuthed(token)).toBe(true)
    expect(isAuthed('garbage')).toBe(false)
    expect(isAuthed(undefined)).toBe(false)
  })

  it('keeps a legacy ADMIN_PASSWORD working as an admin account', () => {
    process.env.ADMIN_PASSWORD = 'legacy-pass'
    const result = verifyFounder('admin@chrgd.dev', 'legacy-pass')
    expect(result).not.toBeNull()
    expect(result!.founder.name).toBe('Admin')
  })

  it('falls back to two demo founders when none are configured', () => {
    clearFounderEnv()
    expect(listFounders()).toHaveLength(2)
    expect(verifyFounder('founder1@chrgd.dev', 'chrgd-founder-1')).not.toBeNull()
    expect(founderAuthMode()).toBe('demo')
  })

  it('reports configured mode once real accounts exist', () => {
    expect(founderAuthMode()).toBe('configured')
  })

  function clearFounderEnv() {
    for (let i = 1; i <= 5; i++) {
      delete process.env[`FOUNDER_${i}_EMAIL`]
      delete process.env[`FOUNDER_${i}_PASSWORD`]
      delete process.env[`FOUNDER_${i}_NAME`]
    }
    delete process.env.ADMIN_PASSWORD
  }

  describe('in a production build', () => {
    // NODE_ENV is typed read-only; the cast is only so the test can simulate a
    // production build. `afterEach` puts the whole env back.
    beforeEach(() => { (process.env as Record<string, string>).NODE_ENV = 'production' })

    it('refuses the demo founders — an unconfigured hub admits nobody', () => {
      clearFounderEnv()
      expect(verifyFounder('founder1@chrgd.dev', 'chrgd-founder-1')).toBeNull()
      expect(verifyFounder('founder2@chrgd.dev', 'chrgd-founder-2')).toBeNull()
      expect(listFounders()).toHaveLength(0)
      expect(founderAuthMode()).toBe('unconfigured')
    })

    it('will not authorise a token minted from the demo credentials', () => {
      // The token is derived from the credentials, so a cookie kept from a dev
      // session must not survive into production.
      const devToken = verifyFounder('founder1@chrgd.dev', 'chrgd-founder-1')
      expect(devToken).toBeNull()
      expect(isAuthed('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toBe(false)
    })

    it('still admits the founders that are actually configured', () => {
      expect(verifyFounder('ada@chrgd.dev', 'secret-1')).not.toBeNull()
      expect(founderAuthMode()).toBe('configured')
    })

    it('still admits a legacy ADMIN_PASSWORD account', () => {
      clearFounderEnv()
      process.env.ADMIN_PASSWORD = 'legacy-pass'
      expect(verifyFounder('admin@chrgd.dev', 'legacy-pass')).not.toBeNull()
      expect(founderAuthMode()).toBe('configured')
    })
  })
})

/**
 * Session tokens.
 *
 * These replaced a deterministic sha256(email:password), which was a
 * password-equivalent that never rotated and could not be revoked without
 * changing the password. The console they guard reads every member's plan, so
 * the properties below are the point of the change, not incidental.
 */
describe('session tokens', () => {
  const creds = ['ada@chrgd.dev', 'secret-1'] as const
  const original = { ...process.env }

  beforeEach(() => {
    process.env.FOUNDER_1_EMAIL = 'Ada@chrgd.dev'
    process.env.FOUNDER_1_PASSWORD = 'secret-1'
    process.env.FOUNDER_1_NAME = 'Ada'
    process.env.FOUNDER_2_EMAIL = 'grace@chrgd.dev'
    process.env.FOUNDER_2_PASSWORD = 'secret-2'
    delete process.env.ADMIN_PASSWORD
  })

  afterEach(() => {
    process.env = { ...original }
  })

  it('issues a different token on every sign-in', () => {
    const a = verifyFounder(...creds)!.token
    const b = verifyFounder(...creds)!.token
    expect(a).not.toBe(b)
    // …and both still work: rotation must not mean the previous device is
    // logged out every time someone signs in on another one.
    expect(founderForToken(a)).not.toBeNull()
    expect(founderForToken(b)).not.toBeNull()
  })

  it('round-trips an email containing dots', () => {
    // `.` separates the token's fields and every address here ends in one, so
    // an unencoded email splits the token into more fields than it has.
    expect(founderForToken(verifyFounder(...creds)!.token)).toEqual({
      email: 'ada@chrgd.dev',
      name: 'Ada',
    })
  })

  it('does not contain the password', () => {
    expect(verifyFounder(...creds)!.token).not.toContain('secret-1')
  })

  it('refuses a token whose body has been edited', () => {
    const token = verifyFounder(...creds)!.token
    const [email, issuedAt, nonce, sig] = token.split('.')
    // Re-dating a token to keep it alive is the obvious forgery to try.
    const future = (Date.now() + 60_000).toString(36)
    expect(founderForToken(`${email}.${future}.${nonce}.${sig}`)).toBeNull()
  })

  it('refuses a token signed for a different founder', () => {
    const ada = verifyFounder('ada@chrgd.dev', 'secret-1')!.token
    const grace = verifyFounder('grace@chrgd.dev', 'secret-2')!.token
    const adaEmail = ada.split('.')[0]
    const [, issuedAt, nonce, sig] = grace.split('.')
    expect(founderForToken(`${adaEmail}.${issuedAt}.${nonce}.${sig}`)).toBeNull()
  })

  it('refuses a token past its lifetime', () => {
    const token = verifyFounder(...creds)!.token
    const realNow = Date.now
    Date.now = () => realNow() + PORTAL_SESSION_TTL_MS + 1000
    try {
      expect(founderForToken(token)).toBeNull()
    } finally {
      Date.now = realNow
    }
  })

  it('stops honouring tokens once the password changes', () => {
    // Revocation with no session table to clear: the signing key is derived
    // from the password, so changing it invalidates everything issued before.
    const token = verifyFounder(...creds)!.token
    expect(founderForToken(token)).not.toBeNull()
    process.env.FOUNDER_1_PASSWORD = 'rotated'
    expect(founderForToken(token)).toBeNull()
    process.env.FOUNDER_1_PASSWORD = 'secret-1'
  })

  it('refuses malformed tokens rather than throwing', () => {
    for (const bad of ['', 'garbage', 'a.b.c', 'a.b.c.d.e', '!!!.1.2.3']) {
      expect(() => founderForToken(bad)).not.toThrow()
      expect(founderForToken(bad)).toBeNull()
    }
  })
})
