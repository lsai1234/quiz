/**
 * The daily job and its front door.
 *
 * Who may trigger a run matters as much as what a run does: it changes what
 * members are billed and emails them.
 */
import { isCronAuthorised, runDailyJob } from '@/lib/changes/daily'

/** Just the header lookup the guard reads. */
const headers = (values: Record<string, string> = {}) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
})

const SECRET = 'a-long-shared-secret'

describe('who may run the daily job', () => {
  it('accepts the secret as a bearer token', () => {
    expect(isCronAuthorised(headers({ authorization: `Bearer ${SECRET}` }), { CRON_SECRET: SECRET })).toBe(true)
  })

  it('also accepts a header, for schedulers that cannot set authorization', () => {
    expect(isCronAuthorised(headers({ 'x-cron-secret': SECRET }), { CRON_SECRET: SECRET })).toBe(true)
  })

  it('refuses a wrong secret, a missing one, and a prefix of the right one', () => {
    for (const h of [
      headers(),
      headers({ authorization: 'Bearer nope' }),
      headers({ authorization: `Bearer ${SECRET.slice(0, -1)}` }),
      headers({ 'x-cron-secret': '' }),
      headers({ 'x-cron-secret': `${SECRET}-extra` }),
    ]) {
      expect(isCronAuthorised(h, { CRON_SECRET: SECRET })).toBe(false)
    }
  })

  it('is open without a secret in development, and closed in production', () => {
    // A deploy that forgets the env var must fail safe rather than leave an
    // unauthenticated endpoint that can bill people.
    expect(isCronAuthorised(headers(), { NODE_ENV: 'development' })).toBe(true)
    expect(isCronAuthorised(headers(), { NODE_ENV: 'production' })).toBe(false)
  })

  it('compares the whole secret, not a prefix', () => {
    // Guards against a length-only or startsWith check slipping in later.
    expect(isCronAuthorised(headers({ authorization: 'Bearer a-long-shared-secreX' }), { CRON_SECRET: SECRET })).toBe(false)
  })
})

describe('a dry run', () => {
  it('reports what it found and says plainly that it wrote nothing', async () => {
    const result = await runDailyJob(true)

    expect(result.dryRun).toBe(true)
    expect(result.note).toMatch(/nobody was emailed/i)
    // A dry run never claims to have done anything.
    expect(result.applied).toBeUndefined()
    expect(result.notified).toBeUndefined()
    expect(result.notifyFailed).toBeUndefined()
  })

  it('still reports the scan, so it is useful as a check', async () => {
    const result = await runDailyJob(true)
    expect(typeof result.scanned).toBe('number')
    expect(typeof result.raised).toBe('number')
  })
})

describe('a real run', () => {
  it('reports every outcome it produced, including failed sends', async () => {
    const result = await runDailyJob(false)

    expect(result.dryRun).toBe(false)
    expect(typeof result.applied).toBe('number')
    expect(typeof result.notified).toBe('number')
    // Surfaced rather than swallowed: an email that didn't go out is the kind
    // of quiet failure that otherwise never gets noticed.
    expect(typeof result.notifyFailed).toBe('number')
  })

  it('is safe to run twice — nothing is applied or emailed a second time', async () => {
    await runDailyJob(false)
    const second = await runDailyJob(false)

    expect(second.applied).toBe(0)
    expect(second.notified).toBe(0)
  })
})
