import { verifyFounder, founderForToken, isAuthed, listFounders, founderAuthMode } from '../auth'

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
