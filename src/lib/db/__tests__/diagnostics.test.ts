/**
 * @jest-environment node
 */
import { runDbDiagnostics, verdictFor } from '../diagnostics'

/**
 * The reading, not the plumbing.
 *
 * What matters about a diagnostic is that its verdict names the right cause: a
 * distant database, a cold start and a slow query all feel like "the hub is
 * slow" and want three different fixes, and a check that blurs them sends
 * somebody tuning queries on a transatlantic round trip.
 */
describe('the verdict', () => {
  it('names the region when every round trip costs tens of milliseconds', () => {
    const v = verdictFor('postgres', 92, 88, 600_000, 40)
    expect(v).toMatch(/different region/i)
    // And says what it costs a screen, because "92ms" alone reads as fine.
    expect(v).toMatch(/0\.6s/)
  })

  it('names both ends when it knows them, because that is the decision', () => {
    const v = verdictFor('postgres', 79, 78, 600_000, 40, {
      function: 'iad1 (Washington DC)',
      database: 'eu-west-2 (London)',
    })
    expect(v).toContain('iad1 (Washington DC)')
    expect(v).toContain('eu-west-2 (London)')
  })

  it('names the cold start when the trips are fast but the server is new', () => {
    const v = verdictFor('postgres', 2, 1, 800, 1)
    expect(v).toMatch(/brand new|starting up/i)
    expect(v).not.toMatch(/different region/i)
  })

  it('clears the database when it is fast on a server that has been up', () => {
    const v = verdictFor('postgres', 2, 1, 600_000, 40)
    expect(v).toMatch(/not what a slow screen is waiting for/i)
  })

  it('flags a same-region hop that is still not short', () => {
    expect(verdictFor('postgres', 22, 18, 600_000, 40)).toMatch(/pooled endpoint/i)
  })

  it('says plainly that a local run proves nothing about the deployment', () => {
    expect(verdictFor('sqlite', 0, 0, 10, 1)).toMatch(/nothing here reflects the deployed site/i)
  })
})

describe('the run', () => {
  it('measures the trip, the instance and the reads a screen makes', async () => {
    const report = await runDbDiagnostics()

    expect(report.engine).toBe('sqlite')
    expect(report.ping.samples).toBeGreaterThan(1)
    expect(report.ping.bestMs).toBeLessThanOrEqual(report.ping.medianMs)
    expect(report.ping.medianMs).toBeLessThanOrEqual(report.ping.worstMs)
    expect(report.work.map((w) => w.label)).toEqual(['Catalogue', 'Recent orders', 'Quiz funnel'])
    expect(report.counts.analytics_events).toBeGreaterThanOrEqual(0)
  })

  it('never returns the credentials that are in the connection string', async () => {
    process.env.DATABASE_URL = 'postgres://someone:hunter2@db.example.com:5432/app'
    try {
      const report = await runDbDiagnostics()
      expect(JSON.stringify(report)).not.toContain('hunter2')
      expect(report.host).toBe('db.example.com:5432')
    } finally {
      delete process.env.DATABASE_URL
    }
  })
})
