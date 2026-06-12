/**
 * One-time script to auto-tag Shopify products for the CHRGD quiz engine.
 *
 * Usage:
 *   SHOPIFY_ADMIN_TOKEN=your_token node scripts/seed-shopify-tags.mjs
 *
 * Set DRY_RUN=true to preview changes without writing:
 *   DRY_RUN=true SHOPIFY_ADMIN_TOKEN=your_token node scripts/seed-shopify-tags.mjs
 */

const STORE = 'sanahealthstore.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN
const API_KEY = process.env.SHOPIFY_API_KEY
const API_SECRET = process.env.SHOPIFY_API_SECRET
const DRY_RUN = process.env.DRY_RUN === 'true'
const API_VERSION = '2024-10'

if (!TOKEN && !(API_KEY && API_SECRET)) {
  console.error('Provide either SHOPIFY_ADMIN_TOKEN or both SHOPIFY_API_KEY + SHOPIFY_API_SECRET')
  process.exit(1)
}

const BASE = `https://${STORE}/admin/api/${API_VERSION}`
const HEADERS = TOKEN
  ? { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN }
  : { 'Content-Type': 'application/json', 'Authorization': `Basic ${Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')}` }

// ─── Tag rules — edit these to match your actual product names ────────────────

// Products to skip entirely — accessories, non-supplement items
const SKIP_TAGS = ['accessory', 'fitness', 'gym']
const SKIP_TITLE_KEYWORDS = ['shaker', 'bottle', 'belt', 'jug', 'color kit', 'colour kit', 'color mini']

function shouldSkip(product) {
  const existingTags = (product.tags || '').toLowerCase()
  const title = product.title.toLowerCase()
  if (SKIP_TAGS.some(t => existingTags.includes(t))) return true
  if (SKIP_TITLE_KEYWORDS.some(k => title.includes(k))) return true
  return false
}

function inferTags(product) {
  const title = product.title.toLowerCase()
  const type = (product.product_type || '').toLowerCase()
  const tags = new Set((product.tags || '').split(',').map(t => t.trim()).filter(Boolean))

  // Detect stim-free early — used to block stimulant tag below
  const isStimFree = title.includes('stim-free') || title.includes('stimfree') ||
    title.includes('stimulant-free') || title.includes('zero stimulant') ||
    title.includes('caffeine free') || title.includes('caffeine-free') ||
    title.includes('pump') && !title.includes('pre-workout')

  // ── Product type ──────────────────────────────────────────────────────────
  if (title.includes('whey') || title.includes('protein') || title.includes('mass') || title.includes('gainer')) {
    addIfMissing(tags, 'product-type:protein')
  }
  if (title.includes('creatine')) addIfMissing(tags, 'product-type:performance')
  if (title.includes('pre-workout') || title.includes('pre workout') || title.includes('preworkout')) {
    addIfMissing(tags, 'product-type:pre-workout')
  }
  if (title.includes('bcaa') || title.includes('amino')) addIfMissing(tags, 'product-type:amino-acids')
  if (title.includes('electrolyte') || title.includes('hydration')) addIfMissing(tags, 'product-type:hydration')
  if (title.includes('omega') || title.includes('vitamin') || title.includes('magnesium') || title.includes('mineral')) {
    addIfMissing(tags, 'product-type:health')
  }
  if (title.includes('collagen') || title.includes('sleep') || title.includes('recovery') || title.includes('joint')) {
    addIfMissing(tags, 'product-type:recovery')
  }
  if (title.includes('thermo') || title.includes('fat burner') || title.includes('burn')) {
    addIfMissing(tags, 'product-type:body-composition')
  }

  // ── Goals ─────────────────────────────────────────────────────────────────
  if (title.includes('whey') || title.includes('protein') || title.includes('mass') || title.includes('creatine')) {
    addIfMissing(tags, 'goal:muscle')
    addIfMissing(tags, 'goal:performance')
  }
  if (title.includes('mass') || title.includes('gainer')) {
    addIfMissing(tags, 'goal:bulking')
  }
  if (title.includes('thermo') || title.includes('fat')) {
    addIfMissing(tags, 'goal:cutting')
  }
  if (title.includes('pre-workout') || title.includes('preworkout') || title.includes('pre workout') || title.includes('caffeine')) {
    addIfMissing(tags, 'goal:energy')
    addIfMissing(tags, 'goal:performance')
  }
  if (title.includes('electrolyte') || title.includes('hydration') || title.includes('bcaa')) {
    addIfMissing(tags, 'goal:hydration')
    addIfMissing(tags, 'goal:performance')
  }
  if (title.includes('collagen') || title.includes('sleep') || title.includes('recovery') || title.includes('bcaa') || title.includes('omega') || title.includes('magnesium')) {
    addIfMissing(tags, 'goal:recovery')
  }
  if (title.includes('vitamin') || title.includes('omega') || title.includes('magnesium') || title.includes('mineral') || title.includes('health')) {
    addIfMissing(tags, 'goal:health')
  }

  // ── Stack levels ──────────────────────────────────────────────────────────
  // Essentials: core basics most people should take
  if (
    title.includes('whey') || title.includes('plant protein') || title.includes('creatine') ||
    title.includes('vitamin d') || title.includes('omega') || title.includes('electrolyte')
  ) {
    addIfMissing(tags, 'stack:essentials')
  }
  // Performance: serious training
  if (
    title.includes('creatine') || title.includes('pre-workout') || title.includes('preworkout') ||
    title.includes('bcaa') || title.includes('electrolyte') || title.includes('whey') ||
    title.includes('plant protein') || title.includes('magnesium') || title.includes('thermo') ||
    title.includes('mass') || title.includes('omega') || title.includes('vitamin')
  ) {
    addIfMissing(tags, 'stack:performance')
  }
  // Complete: everything available
  addIfMissing(tags, 'stack:complete')

  // ── Flags ─────────────────────────────────────────────────────────────────
  if (isStimFree) {
    // no stimulant tag — explicitly stim-free product
  } else if (title.includes('pre-workout') || title.includes('preworkout') || title.includes('thermo')) {
    addIfMissing(tags, 'stimulant')
  }

  if (
    title.includes('plant') || title.includes('vegan') ||
    title.includes('creatine') || title.includes('electrolyte') ||
    title.includes('vitamin') || title.includes('magnesium') || title.includes('bcaa') ||
    (title.includes('pre-workout') && !title.includes('whey'))
  ) {
    addIfMissing(tags, 'vegan')
  }

  // Most basics are beginner-safe; exclude advanced stims and mass gainers
  if (!title.includes('mass') && !title.includes('gainer') && !(title.includes('pre-workout') && !title.includes('stim-free'))) {
    addIfMissing(tags, 'beginner')
  }

  return [...tags].join(', ')
}

function addIfMissing(set, tag) {
  if (!set.has(tag)) set.add(tag)
}

// ─── Shopify REST helpers ─────────────────────────────────────────────────────

async function fetchAllProducts() {
  const products = []
  let url = `${BASE}/products.json?limit=250&fields=id,title,product_type,tags`

  while (url) {
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`)
    const data = await res.json()
    products.push(...data.products)

    // Pagination via Link header
    const link = res.headers.get('link') ?? ''
    const next = link.match(/<([^>]+)>;\s*rel="next"/)
    url = next ? next[1] : null
  }

  return products
}

async function updateProductTags(id, tags) {
  const res = await fetch(`${BASE}/products/${id}.json`, {
    method: 'PUT',
    headers: HEADERS,
    body: JSON.stringify({ product: { id, tags } }),
  })
  if (!res.ok) throw new Error(`Update failed for ${id}: ${await res.text()}`)
  return res.json()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🏷  CHRGD Shopify Tag Seeder ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}\n`)

  const products = await fetchAllProducts()
  console.log(`Found ${products.length} products\n`)

  for (const product of products) {
    if (shouldSkip(product)) {
      console.log(`  ✗ ${product.title} (skipped — accessory/non-supplement)`)
      continue
    }

    const newTags = inferTags(product)
    const changed = newTags !== (product.tags || '')

    console.log(`${changed ? '→' : '·'} ${product.title}`)
    if (changed) {
      console.log(`  was: ${product.tags || '(none)'}`)
      console.log(`  now: ${newTags}`)
    }

    if (changed && !DRY_RUN) {
      await updateProductTags(product.id, newTags)
      await new Promise(r => setTimeout(r, 500)) // respect rate limit
    }
  }

  console.log(`\n✓ Done${DRY_RUN ? ' (dry run — no changes written)' : ''}`)
}

main().catch(err => { console.error(err); process.exit(1) })
