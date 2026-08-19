/**
 * Wipe the trading record before going live.
 *
 * Everything the app accumulated while it was pointed at the Stripe test
 * account and the PowerBody DEMO account is test data wearing production
 * clothes: orders nobody paid for, subscriptions nobody holds, consent rows
 * pointing at a document that named nobody, an outbox full of emails about all
 * of it. Carrying that into the live shop poisons every number the Founders Hub
 * reports and, worse, leaves live cron jobs walking dead subscriptions.
 *
 * So this deletes the RECORD and keeps the WORK:
 *
 *   deleted — accounts, orders, subscriptions, consents, the email outbox,
 *             analytics, partners, share cards, competition entries, and the
 *             supplier snapshots used for change detection
 *   kept    — the curated catalogue, bundles, hub settings and share-card
 *             artwork (all of which is founder-authored, not transactional)
 *
 * DRY RUN BY DEFAULT. It prints what it would delete and exits. Deleting takes
 * `--commit --yes`, and the target database is printed before anything happens
 * so a wrong `DATABASE_URL` is visible rather than discovered afterwards.
 *
 * Usage:
 *   node scripts/reset-data.mjs                      # dry run (counts only)
 *   node scripts/reset-data.mjs --commit --yes       # delete
 *   node scripts/reset-data.mjs --commit --yes --everything
 *                                                    # also drop catalogue,
 *                                                    # bundles, settings, art
 *
 * Targets whatever the app targets: `DATABASE_URL` / `POSTGRES_URL` when set,
 * otherwise the local SQLite file (`DATABASE_PATH`, default `.data/chrgd.db`).
 */

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const args = new Set(process.argv.slice(2))
const COMMIT = args.has('--commit')
const YES = args.has('--yes')
const EVERYTHING = args.has('--everything')

/**
 * The plan lives in `reset-plan.json` rather than here so the test suite can
 * read it without importing an ES module into a CommonJS test environment.
 * `src/lib/db/__tests__/reset-plan.test.ts` asserts it against the schema:
 * a table added to `migrations.ts` and not classified there fails that test.
 *
 * `wipe` is ordered oldest-child-first rather than leaning on ON DELETE CASCADE.
 * SQLite only enforces foreign keys when `PRAGMA foreign_keys` is on, so a
 * cascade that works on Postgres can silently strand rows locally. An explicit
 * order behaves identically on both engines.
 */
const PLAN = JSON.parse(
  readFileSync(new URL('./reset-plan.json', import.meta.url), 'utf8'),
)

/** Tables emptied completely. */
const WIPE = PLAN.wipe
/**
 * Tables deliberately left alone, and why. Named rather than merely omitted so
 * the test can prove every table in the schema was considered — a new table
 * nobody classified is a silent gap in a reset that claims to be complete.
 */
const KEEP = PLAN.keep
/**
 * `kv` rows worth keeping through a reset. Everything else in that table is
 * cache or scratch (the PowerBody detail cache among it) and is dropped.
 */
const KV_KEEP_KEYS = PLAN.kvKeep

function log(...a) {
  console.log(...a)
}

async function openEngine() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const { default: pg } = await import('pg')
    const client = new pg.Client({
      connectionString: url,
      ssl: /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false },
    })
    await client.connect()
    let n = 0
    const sql = (text) => text.replace(/\?/g, () => `$${++n}`)
    return {
      kind: 'postgres',
      label: (() => {
        try {
          const u = new URL(url)
          return `postgres ${u.host}${u.pathname}`
        } catch {
          return 'postgres (unparseable URL)'
        }
      })(),
      async all(text, params = []) {
        n = 0
        const r = await client.query(sql(text), params)
        return r.rows
      },
      async run(text, params = []) {
        n = 0
        await client.query(sql(text), params)
      },
      close: () => client.end(),
    }
  }

  const path = process.env.DATABASE_PATH || '.data/chrgd.db'
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(path)
  db.pragma('foreign_keys = ON')
  return {
    kind: 'sqlite',
    label: `sqlite ${path}`,
    async all(text, params = []) {
      return db.prepare(text).all(...params)
    },
    async run(text, params = []) {
      db.prepare(text).run(...params)
    },
    close: () => db.close(),
  }
}

async function tableExists(db, table) {
  if (db.kind === 'postgres') {
    const rows = await db.all('SELECT to_regclass(?) AS reg', [`public.${table}`])
    return !!rows[0]?.reg
  }
  const rows = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", [table])
  return rows.length > 0
}

async function count(db, table) {
  const rows = await db.all(`SELECT COUNT(*) AS c FROM ${table}`)
  return Number(rows[0]?.c ?? 0)
}

async function main() {
  const db = await openEngine()
  log('')
  log(`  Target: ${db.label}`)
  log(`  Mode:   ${COMMIT && YES ? 'DELETE' : 'dry run (nothing will be written)'}`)
  log(`  Scope:  ${EVERYTHING ? 'everything, INCLUDING catalogue/bundles/settings/art' : 'trading record only — catalogue, bundles, settings and art are kept'}`)
  log('')

  let total = 0
  const present = []
  for (const table of WIPE) {
    if (!(await tableExists(db, table))) {
      log(`  ${'—'.padEnd(9)} ${table} (no such table — skipped)`)
      continue
    }
    const c = await count(db, table)
    present.push(table)
    total += c
    log(`  ${String(c).padStart(8)}  ${table}`)
  }

  // The kv table is mixed: founder-authored state alongside caches.
  let kvDrop = []
  if (await tableExists(db, 'kv')) {
    const keys = (await db.all('SELECT key FROM kv')).map((r) => r.key)
    kvDrop = EVERYTHING ? keys : keys.filter((k) => !KV_KEEP_KEYS.includes(k))
    log('')
    log(`  ${String(kvDrop.length).padStart(8)}  kv rows to drop${kvDrop.length ? `: ${kvDrop.join(', ')}` : ''}`)
    const kept = keys.filter((k) => !kvDrop.includes(k))
    if (kept.length) log(`  ${'kept'.padStart(8)}  ${kept.join(', ')}`)
    total += kvDrop.length
  }

  if (EVERYTHING && (await tableExists(db, 'share_card_art'))) {
    const c = await count(db, 'share_card_art')
    log(`  ${String(c).padStart(8)}  share_card_art`)
    total += c
  }

  log('')
  log(`  ${total} row(s) in scope.`)

  if (!COMMIT || !YES) {
    log('')
    log('  Dry run only. Nothing was written.')
    log('  To actually delete:  node scripts/reset-data.mjs --commit --yes')
    log('')
    await db.close()
    return
  }

  log('')
  log('  Deleting…')
  for (const table of present) {
    await db.run(`DELETE FROM ${table}`)
    log(`    cleared ${table}`)
  }
  for (const key of kvDrop) {
    await db.run('DELETE FROM kv WHERE key = ?', [key])
  }
  if (kvDrop.length) log(`    cleared ${kvDrop.length} kv row(s)`)
  if (EVERYTHING && (await tableExists(db, 'share_card_art'))) {
    await db.run('DELETE FROM share_card_art')
    log('    cleared share_card_art')
  }

  log('')
  log('  Done. The schema is untouched — migrations do not need re-running.')
  log('')
  await db.close()
}

/**
 * Only run when invoked as a script. The plan constants are exported so the
 * test suite can assert they cover the schema, and importing a module must
 * never be what wipes a database.
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('\n  Reset failed:', err instanceof Error ? err.message : err, '\n')
    process.exit(1)
  })
}

export { WIPE, KEEP, KV_KEEP_KEYS }
