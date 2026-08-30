import { loginAllowed, recordFailure, recordSuccess, __resetRateLimit } from '../rate-limit'

beforeEach(__resetRateLimit)

describe('founder login rate limit', () => {
  const ip = '1.2.3.4'
  const email = 'ada@chrgd.dev'

  function failTimes(n: number) {
    for (let i = 0; i < n; i++) recordFailure(ip, email)
  }

  it('allows attempts up to the limit', () => {
    failTimes(7)
    expect(loginAllowed(ip, email).allowed).toBe(true)
  })

  it('closes the door once the limit is reached', () => {
    failTimes(8)
    const gate = loginAllowed(ip, email)
    expect(gate.allowed).toBe(false)
    if (!gate.allowed) expect(gate.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('clears the record on a successful sign-in', () => {
    failTimes(8)
    recordSuccess(ip, email)
    expect(loginAllowed(ip, email).allowed).toBe(true)
  })

  it('does not let one attacker lock a founder out from elsewhere', () => {
    // Keyed by IP AND email, so exhausting the attempts from one address leaves
    // the real founder able to sign in from theirs.
    failTimes(20)
    expect(loginAllowed('9.9.9.9', email).allowed).toBe(true)
  })

  it('keeps separate counts per account on one address', () => {
    failTimes(8)
    expect(loginAllowed(ip, 'grace@chrgd.dev').allowed).toBe(true)
  })

  it('treats the email case-insensitively, as the login does', () => {
    failTimes(8)
    expect(loginAllowed(ip, 'ADA@chrgd.dev').allowed).toBe(false)
  })

  it('reopens once the window passes', () => {
    failTimes(8)
    const later = Date.now() + 16 * 60 * 1000
    expect(loginAllowed(ip, email, later).allowed).toBe(true)
  })

  it('extends the lockout when guessing continues', () => {
    // Sliding, not fixed: an attacker who keeps trying must not get a fresh
    // allowance the moment the original window ends.
    failTimes(8)
    const nearlyOver = Date.now() + 14 * 60 * 1000
    recordFailure(ip, email, nearlyOver)
    expect(loginAllowed(ip, email, nearlyOver + 60 * 1000).allowed).toBe(false)
  })

  it('counts a missing IP as its own bucket rather than throwing', () => {
    for (let i = 0; i < 8; i++) recordFailure(null, email)
    expect(loginAllowed(null, email).allowed).toBe(false)
    expect(loginAllowed(ip, email).allowed).toBe(true)
  })
})
