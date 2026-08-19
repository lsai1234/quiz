/**
 * The go-live reset (`scripts/reset-data.mjs`) claims to clear the whole trading
 * record. That claim rots the moment somebody adds a table and doesn't think
 * about it: the reset keeps passing, keeps reporting success, and quietly leaves
 * test data behind in the one table nobody classified.
 *
 * So the plan is checked against the schema rather than trusted. Every table in
 * `MIGRATIONS` must be either wiped or explicitly kept-with-a-reason — adding a
 * table without classifying it fails here, which is the only moment anyone is
 * thinking about that table anyway.
 */
import fs from 'fs'
import path from 'path'
import { MIGRATIONS } from '../migrations'

/**
 * Read as data, not imported as a module: the script is an ES module and this
 * suite runs as CommonJS, so `require`-ing it works under a bare `jest` run and
 * fails under the `--experimental-vm-modules` one the project actually uses.
 */
const plan = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'scripts', 'reset-plan.json'), 'utf8'),
) as { wipe: string[]; keep: Record<string, string>; kvKeep: string[] }

const WIPE = plan.wipe
const KEEP = plan.keep
const KV_KEEP_KEYS = plan.kvKeep

/** Every table the migrations create. */
function schemaTables(): string[] {
  const names = new Set<string>()
  for (const sql of MIGRATIONS) {
    for (const m of sql.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([a-z_]+)/gi)) {
      names.add(m[1].toLowerCase())
    }
  }
  return [...names].sort()
}

describe('go-live reset plan', () => {
  it('classifies every table in the schema as wiped or kept', () => {
    const unclassified = schemaTables().filter((t) => !WIPE.includes(t) && !(t in KEEP))
    expect(unclassified).toEqual([])
  })

  it('does not both wipe and keep the same table', () => {
    expect(WIPE.filter((t) => t in KEEP)).toEqual([])
  })

  it('only names tables that actually exist in the schema', () => {
    const tables = schemaTables()
    expect(WIPE.filter((t) => !tables.includes(t))).toEqual([])
    expect(Object.keys(KEEP).filter((t) => !tables.includes(t))).toEqual([])
  })

  it('gives a reason for everything it keeps', () => {
    for (const [table, reason] of Object.entries(KEEP)) {
      expect(typeof reason).toBe('string')
      expect(reason.length).toBeGreaterThan(20)
      expect(table).toBeTruthy()
    }
  })

  it('deletes users last, after everything that references them', () => {
    // Postgres cascades and SQLite (usually) does not, so the order is the
    // guarantee, not the foreign keys.
    expect(WIPE[WIPE.length - 1]).toBe('users')
  })

  it('deletes partners after every table that references them', () => {
    const partnerChildren = WIPE.filter((t) => t.startsWith('partner_'))
    const partnersAt = WIPE.indexOf('partners')
    expect(partnersAt).toBeGreaterThan(-1)
    for (const child of partnerChildren) {
      expect(WIPE.indexOf(child)).toBeLessThan(partnersAt)
    }
  })

  it('keeps the founder-authored kv rows and nothing transactional', () => {
    expect(KV_KEEP_KEYS).toEqual(
      expect.arrayContaining(['portal:products', 'portal:bundles', 'portal:settings']),
    )
    // The PowerBody detail cache is not founder-authored: it must be droppable,
    // so that a sandbox-era cache cannot survive into the live catalogue.
    expect(KV_KEEP_KEYS).not.toContain('powerbody:product-detail')
  })
})
