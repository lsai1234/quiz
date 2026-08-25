/**
 * Backfill the SKU → PowerBody `product_id` map.
 *
 *   npx tsx scripts/backfill-product-ids.ts --skus P44338,P46934
 *   npx tsx scripts/backfill-product-ids.ts --file roster.csv --column sku
 *   npx tsx scripts/backfill-product-ids.ts --file roster.csv --seed-only
 *
 * WHY THIS IS A SCRIPT AND NOT PART OF THE IMPORT
 * ──────────────────────────────────────────────
 * Step 2 below costs hundreds of throttled calls. That is fine once, offline,
 * with a progress log — and completely wrong inside a paste-and-import, where
 * somebody is watching a spinner and the request has sixty seconds to live. The
 * output is committed (`src/lib/supplier/product-id-map.json`), so the cost is
 * paid once and every import afterwards reads a file.
 *
 * TWO STEPS, AND THE FIRST STANDS ALONE
 * ─────────────────────────────────────
 * 1. Walk `getProductList` and record every {sku, product_id} it gives up. Free,
 *    exact, no searching. On an account without the 3,000-product cap this
 *    resolves everything and step 2 never runs.
 *
 * 2. For SKUs the walk could not reach, binary-search `getProductInfo` — which
 *    takes an id and returns the SKU, so it can be run backwards. Only ever
 *    needed because this account's feed stops at 3,000 of 8,023 products, an
 *    undocumented cap with no parameter to raise it. If PowerBody lift it, delete
 *    nothing: step 1 simply starts answering everything.
 *
 * SAFETY
 * ──────
 * An id is recorded only when the product at it returns the EXACT SKU asked for.
 * Ids and SKU numbers correlate, so a near miss is a real product — the wrong
 * one — and writing that into the map would import another brand's product under
 * your SKU. Nothing here infers an id from the fit; the fit only says where to
 * start looking.
 *
 * Resumable: the map is written after every resolution, so a crash at SKU 60 of
 * 67 costs one SKU, not sixty. Re-running resolves only what is still missing.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { createSoapClient, type PowerBodySoapClient } from '../src/lib/supplier/powerbody/soap'
import { findProductIdForSku, sweepForSku, fitIdFromSku, skuNumber } from '../src/lib/supplier/product-id-search'

const MAP_PATH = resolvePath(process.cwd(), 'src/lib/supplier/product-id-map.json')

/** Their feed is paged; this is the same guard the adapter uses. */
const MAX_PAGES = 400

/**
 * Politeness, deliberately stricter than the app's.
 *
 * The app is answering somebody who is waiting. This is a background sweep with
 * nobody watching, so it trades speed for a much smaller chance of tripping the
 * rate limit and poisoning the account for the shop.
 */
const CONCURRENCY = 1
const MIN_INTERVAL_MS = 200

interface Args {
  skus: string[]
  file: string | null
  column: string
  seedOnly: boolean
  maxProbes: number
  dryRun: boolean
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | null => {
    const i = argv.indexOf(`--${name}`)
    return i === -1 ? null : (argv[i + 1] ?? null)
  }
  const has = (name: string) => argv.includes(`--${name}`)
  return {
    skus: (get('skus') ?? '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean),
    file: get('file'),
    column: get('column') ?? 'sku',
    seedOnly: has('seed-only'),
    maxProbes: Number(get('max-probes') ?? 200),
    dryRun: has('dry-run'),
  }
}

/** SKUs from a CSV column. Tolerates the semicolon delimiter PowerBody's own
 *  feed uses as well as a comma. */
function skusFromCsv(path: string, column: string): string[] {
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '')
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) return []
  const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ','
  const header = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ''))
  const index = header.indexOf(column)
  if (index === -1) throw new Error(`Column "${column}" not in ${path}. Found: ${header.join(', ')}`)
  return lines
    .slice(1)
    .map((line) => (line.split(delimiter)[index] ?? '').trim().replace(/^"|"$/g, ''))
    .filter(Boolean)
}

function loadMap(): Record<string, number> {
  try {
    return JSON.parse(readFileSync(MAP_PATH, 'utf8')) as Record<string, number>
  } catch {
    return {}
  }
}

/** Written sorted so a diff shows what changed rather than a reshuffle. */
function saveMap(map: Record<string, number>): void {
  const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(MAP_PATH, `${JSON.stringify(sorted, null, 2)}\n`)
}

function clientFromEnv(): PowerBodySoapClient {
  const { POWERBODY_API_URL: url, POWERBODY_API_USER: username, POWERBODY_API_KEY: apiKey } = process.env
  if (!url || !username || !apiKey) {
    throw new Error(
      'POWERBODY_API_URL, POWERBODY_API_USER and POWERBODY_API_KEY must all be set. ' +
        'Put them in .env.local and run with: node --env-file=.env.local',
    )
  }
  return createSoapClient({ url, username, apiKey, maxConcurrent: CONCURRENCY, minIntervalMs: MIN_INTERVAL_MS })
}

interface ListRow {
  product_id?: string | number
  sku?: string
}

/** Step 1 — everything the feed will give up, for free. */
async function seedFromFeed(client: PowerBodySoapClient): Promise<Map<string, number>> {
  const pairs = new Map<string, number>()
  for (let page = 1; page <= MAX_PAGES; page++) {
    const rows = await client.call<ListRow[] | null>('dropshipping.getProductList', { page })
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log(`  feed ended at page ${page} — ${pairs.size} products`)
      return pairs
    }
    for (const row of rows) {
      const sku = String(row.sku ?? '').trim()
      const id = Number(row.product_id)
      if (sku && Number.isFinite(id) && id > 0) pairs.set(sku, id)
    }
    if (page % 25 === 0) console.log(`  page ${page}… ${pairs.size} products`)
  }
  console.log(`  stopped at the ${MAX_PAGES}-page guard — ${pairs.size} products`)
  return pairs
}

/** One probe: what SKU lives at this id? Absent, archived and disabled products
 *  all count as "nothing here" — they are not the answer and must not stop the
 *  search. */
function makeProbe(client: PowerBodySoapClient) {
  return async (productId: number): Promise<{ sku: string | null }> => {
    try {
      // A RAW id, not JSON — their guide, page 11. The one method here that
      // works that way.
      const reply = await client.call<unknown>('dropshipping.getProductInfo', String(productId))
      const info = (Array.isArray(reply) ? reply[0] : reply) as Record<string, unknown> | null
      if (!info || typeof info !== 'object') return { sku: null }
      const status = String(info.status ?? '').toLowerCase()
      if (status === 'archival' || status === 'disabled') return { sku: null }
      const sku = String(info.sku ?? '').trim()
      return { sku: sku === '' ? null : sku }
    } catch {
      // A fault on one id is not a reason to abandon the sweep — it is one more
      // id with nothing usable at it.
      return { sku: null }
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const wanted = [...new Set([...args.skus, ...(args.file ? skusFromCsv(args.file, args.column) : [])])]
  if (wanted.length === 0) {
    console.error('Give SKUs with --skus P1,P2 or --file roster.csv [--column sku]')
    process.exit(1)
  }

  const map = loadMap()
  console.log(`${wanted.length} SKUs asked for · ${Object.keys(map).length} already in the map\n`)

  const client = clientFromEnv()
  try {
    console.log('Step 1 — walking getProductList (free, exact)')
    const seed = await seedFromFeed(client)

    let added = 0
    for (const sku of wanted) {
      const id = seed.get(sku)
      if (id !== undefined && map[sku] !== id) {
        map[sku] = id
        added += 1
      }
    }
    if (added > 0 && !args.dryRun) saveMap(map)
    console.log(`  resolved ${added} from the feed\n`)

    const missing = wanted.filter((sku) => map[sku] === undefined)
    if (missing.length === 0) {
      console.log('Everything resolved from the feed. Step 2 not needed.')
      return
    }
    if (args.seedOnly) {
      console.log(`${missing.length} unresolved, and --seed-only was given. Stopping.`)
      console.log(missing.join(', '))
      return
    }

    // The fit is built from what the feed DID give up, so it needs no external
    // file of predictions — and it re-learns itself if the catalogue shifts.
    const knownPairs = [...seed.entries()].map(([sku, productId]) => ({ sku, productId }))
    const predict = fitIdFromSku(knownPairs)
    const highestKnownId = Math.max(...knownPairs.map((p) => p.productId), 1)

    console.log(`Step 2 — searching for ${missing.length} SKUs the feed cannot reach`)
    console.log(`  (${knownPairs.length} known pairs anchor the search; highest known id ${highestKnownId})\n`)

    const probe = makeProbe(client)
    const unresolved: string[] = []
    let spent = 0

    for (const [n, sku] of missing.entries()) {
      const predicted = predict(sku)
      if (predicted === null || skuNumber(sku) === null) {
        console.log(`  [${n + 1}/${missing.length}] ${sku} — no number in this SKU, cannot search`)
        unresolved.push(sku)
        continue
      }
      // Wide enough to absorb the fit's error (a few hundred ids on real data),
      // and floored at the highest id the feed knows so the search starts where
      // the reachable catalogue stops.
      const lo = Math.max(1, Math.min(predicted - 6000, highestKnownId))
      const hi = predicted + 6000

      const found = await findProductIdForSku({ target: sku, lo, hi, probe, maxProbes: args.maxProbes })
      spent += found.probes

      let productId = found.productId
      if (productId === null) {
        // The ordering is NEAR monotone — about 3% of pairs are inverted — and a
        // product on the wrong side of an inversion is invisible to a bisect but
        // sits close to where the fit put it.
        const swept = await sweepForSku({ target: sku, centre: predicted, radius: 60, probe })
        spent += swept.probes
        productId = swept.productId
      }

      if (productId === null) {
        console.log(`  [${n + 1}/${missing.length}] ${sku} — NOT FOUND (${found.reason}, ${spent} probes so far)`)
        unresolved.push(sku)
        continue
      }

      map[sku] = productId
      // Written now, not at the end: a crash must cost one SKU, not all of them.
      if (!args.dryRun) saveMap(map)
      console.log(`  [${n + 1}/${missing.length}] ${sku} → ${productId} (${spent} probes so far)`)
    }

    console.log(`\n${wanted.length - unresolved.length}/${wanted.length} resolved · ${spent} probes`)
    if (unresolved.length > 0) {
      // Named, never swallowed: an unresolved SKU is a product that will not
      // import, and it has to be visible rather than inferred from a count.
      console.log(`\nUNRESOLVED (${unresolved.length}) — these will not import:`)
      for (const sku of unresolved) console.log(`  ${sku}`)
    }
    console.log(`\nMap: ${MAP_PATH}${args.dryRun ? ' (dry run — nothing written)' : ''}`)
  } finally {
    // Always, even on failure: a session left open is one the next run cannot have.
    await client.endSession().catch(() => {})
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
