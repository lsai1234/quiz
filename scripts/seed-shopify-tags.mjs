/**
 * seed-shopify-tags.mjs
 *
 * Adds CHRGD quiz tags and metafields to your Shopify products via the Admin API.
 *
 * USAGE
 *   node scripts/seed-shopify-tags.mjs [--dry-run]
 *
 * REQUIRED ENV VARS (add to .env.local or export before running)
 *   SHOPIFY_STORE_DOMAIN      e.g. your-store.myshopify.com
 *   SHOPIFY_ADMIN_TOKEN       shpat_xxxxxxxxxxxxxxxxxxxxxxxx
 *
 * HOW MATCHING WORKS
 * The script fetches every product from your store, then matches each one to
 * an entry in PRODUCT_MAP using the Shopify product handle.  If your handles
 * differ from the CHRGD defaults, edit the keys in PRODUCT_MAP to match.
 *
 * DRY RUN
 *   Pass --dry-run to print what would change without touching Shopify.
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Load .env.local ──────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = join(__dirname, '..', '.env.local')
  try {
    const lines = readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  } catch {
    // no .env.local — rely on shell env vars
  }
}

loadEnv()

// ─── Config ───────────────────────────────────────────────────────────────────

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN
const TOKEN  = process.env.SHOPIFY_ADMIN_TOKEN
const DRY_RUN = process.argv.includes('--dry-run')
const API_VERSION = '2024-10'

if (!DOMAIN) {
  console.error('❌  SHOPIFY_STORE_DOMAIN is not set.')
  process.exit(1)
}
if (!TOKEN) {
  console.error('❌  SHOPIFY_ADMIN_TOKEN is not set.')
  console.error('    In Shopify admin → Apps → Develop apps → create a custom app')
  console.error('    with the write_products Admin API scope, then copy the token.')
  process.exit(1)
}

const BASE    = `https://${DOMAIN}/admin/api/${API_VERSION}`
const HEADERS = { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN }

// ─── Product map ──────────────────────────────────────────────────────────────
// Key = Shopify product handle (visible in the URL on the product page).
// Edit the keys below to match your actual handles if they differ from defaults.

const PRODUCT_MAP = {
  'chrgd-whey-protein': {
    slots:               ['protein'],
    goals:               ['muscle', 'recovery', 'bulking'],
    swapGroup:           'protein-whey',
    dietary:             ['gluten-free'],
    stimulant:           false,
    coreEligible:        true,
    boosterEligible:     false,
    stackPriority:       10,
    marginPriority:      8,
    safeWording:         'Fast-absorbing protein to build and repair muscle after training.',
    subscriptionEligible: true,
    productType:         'Protein',
    formats:             'powder',
  },
  'chrgd-plant-protein': {
    slots:               ['protein', 'vegan-support'],
    goals:               ['muscle', 'recovery', 'health'],
    swapGroup:           'protein-plant',
    dietary:             ['vegan', 'vegetarian', 'dairy-free', 'gluten-free'],
    stimulant:           false,
    coreEligible:        true,
    boosterEligible:     false,
    stackPriority:       10,
    marginPriority:      8,
    safeWording:         'A complete plant-based protein that covers all essential amino acids.',
    subscriptionEligible: true,
    productType:         'Protein',
    formats:             'powder',
  },
  'chrgd-mass-builder': {
    slots:               ['protein'],
    goals:               ['bulking', 'muscle'],
    swapGroup:           'protein-mass',
    dietary:             ['gluten-free'],
    stimulant:           false,
    coreEligible:        true,
    boosterEligible:     false,
    stackPriority:       8,
    marginPriority:      7,
    safeWording:         'High-calorie shake for people trying to gain size and mass.',
    subscriptionEligible: true,
    productType:         'Protein',
    formats:             'powder',
  },
  'chrgd-creatine': {
    slots:               ['performance'],
    goals:               ['muscle', 'performance', 'bulking', 'energy'],
    swapGroup:           'creatine',
    daysOfSupply:        100,
    dietary:             ['vegan', 'vegetarian', 'gluten-free', 'dairy-free'],
    stimulant:           false,
    coreEligible:        true,
    boosterEligible:     false,
    stackPriority:       9,
    marginPriority:      8,
    safeWording:         'Proven to build strength and power — take it daily to see results.',
    subscriptionEligible: true,
    productType:         'Performance',
    formats:             'powder',
  },
  'chrgd-pre-workout': {
    slots:               ['energy'],
    goals:               ['energy', 'performance', 'muscle'],
    consumptionCadence:  'per-workout',
    swapGroup:           'pre-workout-stim',
    dietary:             ['vegan', 'vegetarian', 'gluten-free', 'dairy-free'],
    stimulant:           true,
    coreEligible:        true,
    boosterEligible:     false,
    stackPriority:       8,
    marginPriority:      8,
    safeWording:         'Boosts energy, focus and blood flow before training.',
    subscriptionEligible: true,
    productType:         'Pre-Workout',
    formats:             'powder',
  },
  'chrgd-pre-workout-stim-free': {
    slots:               ['energy'],
    goals:               ['energy', 'performance'],
    consumptionCadence:  'per-workout',
    swapGroup:           'pre-workout-stim-free',
    dietary:             ['vegan', 'vegetarian', 'gluten-free', 'dairy-free'],
    stimulant:           false,
    coreEligible:        true,
    boosterEligible:     false,
    stackPriority:       7,
    marginPriority:      7,
    safeWording:         'Improves blood flow and pump during training — no caffeine.',
    subscriptionEligible: true,
    productType:         'Pre-Workout',
    formats:             'powder',
  },
  'chrgd-electrolytes': {
    slots:               ['hydration'],
    goals:               ['hydration', 'performance', 'recovery'],
    consumptionCadence:  'per-workout',
    swapGroup:           'electrolytes',
    dietary:             ['vegan', 'vegetarian', 'gluten-free', 'dairy-free'],
    stimulant:           false,
    coreEligible:        true,
    boosterEligible:     false,
    stackPriority:       7,
    marginPriority:      6,
    safeWording:         'Keeps you hydrated and prevents cramps — especially useful in long or sweaty sessions.',
    subscriptionEligible: true,
    productType:         'Hydration',
    formats:             'powder',
  },
  'chrgd-bcaa': {
    slots:               ['recovery', 'hydration'],
    goals:               ['recovery', 'hydration', 'performance'],
    consumptionCadence:  'per-workout',
    swapGroup:           'aminos',
    dietary:             ['vegan', 'vegetarian', 'gluten-free', 'dairy-free'],
    stimulant:           false,
    coreEligible:        true,
    boosterEligible:     true,
    stackPriority:       6,
    marginPriority:      6,
    safeWording:         'Amino acids that speed up muscle repair and reduce soreness.',
    subscriptionEligible: true,
    productType:         'Amino Acids',
    formats:             'powder',
  },
  'chrgd-collagen': {
    slots:               ['recovery'],
    goals:               ['recovery', 'health', 'performance'],
    swapGroup:           'collagen',
    dietary:             ['gluten-free', 'dairy-free'],
    stimulant:           false,
    coreEligible:        false,
    boosterEligible:     true,
    stackPriority:       5,
    marginPriority:      6,
    safeWording:         'Supports joint, tendon and skin health — especially for high-frequency training.',
    subscriptionEligible: true,
    productType:         'Recovery',
    formats:             'powder',
  },
  'chrgd-omega-3': {
    slots:               ['health'],
    goals:               ['health', 'recovery'],
    swapGroup:           'omega-3',
    daysOfSupply:        90,
    dietary:             ['gluten-free', 'dairy-free'],
    stimulant:           false,
    coreEligible:        true,
    boosterEligible:     false,
    stackPriority:       6,
    marginPriority:      6,
    safeWording:         'Supports heart, brain and joint health — one of the most recommended daily supplements.',
    subscriptionEligible: true,
    productType:         'Health',
    formats:             'softgels',
  },
  'chrgd-vitamin-d3-k2': {
    slots:               ['health'],
    goals:               ['health'],
    swapGroup:           'vitamin-d',
    daysOfSupply:        60,
    dietary:             ['vegan', 'vegetarian', 'gluten-free', 'dairy-free'],
    stimulant:           false,
    coreEligible:        true,
    boosterEligible:     false,
    stackPriority:       5,
    marginPriority:      6,
    safeWording:         'Supports immunity, bone health and energy — especially important for people who train indoors.',
    subscriptionEligible: true,
    productType:         'Health',
    formats:             'capsules',
  },
  'chrgd-multivitamin': {
    slots:               ['health'],
    goals:               ['health', 'energy', 'performance'],
    swapGroup:           'multivitamin',
    dietary:             ['vegan', 'vegetarian', 'gluten-free', 'dairy-free'],
    stimulant:           false,
    coreEligible:        true,
    boosterEligible:     false,
    stackPriority:       5,
    marginPriority:      5,
    safeWording:         'Covers everyday vitamin and mineral gaps to keep you performing at your best.',
    subscriptionEligible: true,
    productType:         'Health',
    formats:             'capsules',
  },
  'chrgd-magnesium': {
    slots:               ['sleep', 'recovery'],
    goals:               ['recovery', 'health'],
    swapGroup:           'magnesium',
    dietary:             ['vegan', 'vegetarian', 'gluten-free', 'dairy-free'],
    stimulant:           false,
    coreEligible:        true,
    boosterEligible:     false,
    stackPriority:       5,
    marginPriority:      6,
    safeWording:         'Helps you wind down, sleep deeper and recover faster. Take before bed.',
    subscriptionEligible: true,
    productType:         'Recovery',
    formats:             'capsules',
  },
  'chrgd-sleep-support': {
    slots:               ['sleep', 'recovery'],
    goals:               ['recovery', 'health'],
    swapGroup:           'sleep-support',
    dietary:             ['vegan', 'vegetarian', 'gluten-free', 'dairy-free'],
    stimulant:           false,
    coreEligible:        false,
    boosterEligible:     true,
    stackPriority:       4,
    marginPriority:      6,
    safeWording:         'Promotes deep sleep and overnight muscle recovery — take 30 mins before bed.',
    subscriptionEligible: true,
    productType:         'Recovery',
    formats:             'capsules',
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildNewTags(cfg) {
  const tags = []
  for (const slot of cfg.slots)  tags.push(`slot:${slot}`)
  for (const goal of cfg.goals)  tags.push(`goal:${goal}`)
  for (const d    of cfg.dietary) tags.push(`dietary:${d}`)
  tags.push(`swap:${cfg.swapGroup}`)
  tags.push(`product-type:${cfg.productType.toLowerCase().replace(/\s+/g, '-')}`)
  if (cfg.stimulant)       tags.push('stimulant')
  if (cfg.coreEligible)    tags.push('core-eligible')
  if (cfg.boosterEligible) tags.push('booster-eligible')
  return tags
}

function buildMetafields(cfg) {
  const fields = [
    { namespace: 'chrgd', key: 'stack_priority',        type: 'number_integer',         value: String(cfg.stackPriority) },
    { namespace: 'chrgd', key: 'margin_priority',       type: 'number_integer',         value: String(cfg.marginPriority) },
    { namespace: 'chrgd', key: 'safe_wording',          type: 'single_line_text_field', value: cfg.safeWording },
    { namespace: 'chrgd', key: 'subscription_eligible', type: 'boolean',                value: String(cfg.subscriptionEligible) },
    { namespace: 'chrgd', key: 'days_of_supply',        type: 'number_integer',         value: String(cfg.daysOfSupply ?? 30) },
    { namespace: 'chrgd', key: 'subscription_only',     type: 'boolean',                value: String(cfg.subscriptionOnly ?? false) },
    { namespace: 'chrgd', key: 'consumption_cadence',   type: 'single_line_text_field', value: cfg.consumptionCadence ?? 'daily' },
    { namespace: 'chrgd', key: 'doses_per_unit',        type: 'number_integer',         value: String(cfg.dosesPerUnit ?? cfg.daysOfSupply ?? 30) },
    { namespace: 'chrgd', key: 'formats',               type: 'single_line_text_field', value: cfg.formats },
  ]
  // The monthly refill a longer-lasting product flips to on subscription.
  if (cfg.subscriptionProductHandle) {
    fields.push({ namespace: 'chrgd', key: 'subscription_product_handle', type: 'single_line_text_field', value: cfg.subscriptionProductHandle })
  }
  // Optional minimum subscription commitment (months).
  if (cfg.minSubscriptionMonths) {
    fields.push({ namespace: 'chrgd', key: 'min_subscription_months', type: 'number_integer', value: String(cfg.minSubscriptionMonths) })
  }
  return fields
}

async function adminFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, { ...options, headers: HEADERS })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Shopify ${options.method ?? 'GET'} ${path} → ${res.status}: ${body}`)
  }
  return res.json()
}

// ─── Fetch all products (handles pagination for stores with >250 products) ────

async function fetchAllProducts() {
  const products = []
  let pageInfo = null

  do {
    const qs = pageInfo
      ? `limit=250&page_info=${pageInfo}&fields=id,handle,title,tags`
      : `limit=250&fields=id,handle,title,tags`

    const res = await fetch(`${BASE}/products.json?${qs}`, { headers: HEADERS })
    if (!res.ok) throw new Error(`Failed to fetch products: ${res.status}`)

    const data = await res.json()
    products.push(...data.products)

    // Parse Link header for cursor-based pagination
    const link = res.headers.get('link') ?? ''
    const nextMatch = link.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/)
    pageInfo = nextMatch ? nextMatch[1] : null
  } while (pageInfo)

  return products
}

// ─── Apply tags + metafields to one product ───────────────────────────────────

async function applyToProduct(product, cfg) {
  const newTags = buildNewTags(cfg)

  // Preserve any existing tags that are NOT managed by this script
  const existingTags = product.tags ? product.tags.split(', ').filter(Boolean) : []
  const managedPrefixes = [
    'slot:', 'goal:', 'dietary:', 'swap:', 'product-type:',
    'stimulant', 'core-eligible', 'booster-eligible',
  ]
  const preserved  = existingTags.filter(t => !managedPrefixes.some(p => t === p || t.startsWith(p)))
  const mergedTags = [...new Set([...preserved, ...newTags])].sort().join(', ')

  if (DRY_RUN) {
    console.log(`\n  [DRY RUN] ${product.handle}`)
    console.log(`    tags → ${mergedTags}`)
    buildMetafields(cfg).forEach(mf =>
      console.log(`    metafield → chrgd.${mf.key} = "${mf.value}"`)
    )
    return
  }

  // Update tags
  await adminFetch(`/products/${product.id}.json`, {
    method: 'PUT',
    body: JSON.stringify({ product: { id: product.id, tags: mergedTags } }),
  })

  // Upsert each metafield
  for (const mf of buildMetafields(cfg)) {
    await adminFetch(`/products/${product.id}/metafields.json`, {
      method: 'POST',
      body: JSON.stringify({
        metafield: { ...mf, owner_resource: 'product', owner_id: product.id },
      }),
    })
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀  CHRGD Shopify tag seeder')
  console.log(`    Store   : ${DOMAIN}`)
  console.log(`    API ver : ${API_VERSION}`)
  console.log(`    Mode    : ${DRY_RUN ? 'DRY RUN — no changes made' : 'LIVE — writing to Shopify'}\n`)

  const products = await fetchAllProducts()
  console.log(`📦  Found ${products.length} products in your store\n`)

  let matched = 0
  let skipped = 0
  const unmatched = []

  for (const product of products) {
    const cfg = PRODUCT_MAP[product.handle]
    if (!cfg) {
      unmatched.push(`  ⏭   "${product.title}" (handle: ${product.handle})`)
      skipped++
      continue
    }
    if (!DRY_RUN) process.stdout.write(`  ⏳  ${product.handle} … `)
    await applyToProduct(product, cfg)
    if (!DRY_RUN) console.log('✅')
    matched++
  }

  if (unmatched.length > 0) {
    console.log('\nSkipped (not in PRODUCT_MAP):')
    unmatched.forEach(l => console.log(l))
  }

  console.log(`\n──────────────────────────────────────`)
  console.log(`✅  Done — ${matched} products tagged, ${skipped} skipped`)

  if (skipped > 0) {
    console.log('\n💡  To tag skipped products, add an entry to PRODUCT_MAP in this script')
    console.log('    with the product handle as the key.')
  }

  if (!DRY_RUN) {
    console.log('\n🔄  The /api/catalogue cache updates within 5 minutes.')
    console.log('    Or restart your dev server to see the changes immediately.')
  }
}

main().catch(err => {
  console.error('\n❌  Fatal error:', err.message)
  process.exit(1)
})
