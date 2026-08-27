/**
 * Backfill product descriptions that were imported before the import path
 * cleaned them.
 *
 *   npx tsx scripts/clean-descriptions.ts                 # report only
 *   npx tsx scripts/clean-descriptions.ts --write         # strip the markup
 *   npx tsx scripts/clean-descriptions.ts --write --ai    # …and rewrite in our voice
 *   npx tsx scripts/clean-descriptions.ts --write --ai --limit 5
 *
 * WHY A SCRIPT
 * ────────────
 * The markup strip is instant and could run anywhere. The `--ai` pass is one
 * API call per product, so a full catalogue is minutes of work and real money —
 * the same reason `backfill-product-ids.ts` is a script and not part of import.
 * Running it here means it is watched, resumable and costs nothing to abandon.
 *
 * DRY RUN BY DEFAULT
 * ──────────────────
 * Nothing is written without `--write`. The report prints the before and after
 * for every product it would change, because a bad rewrite is much easier to
 * catch reading a diff than reading a catalogue.
 *
 * SAFE TO RE-RUN
 * ──────────────
 * `cleanDescription` is idempotent and products whose description is already
 * clean are skipped, so a second run is a no-op. An interrupted `--ai` run
 * resumes: it writes after every product, so the work already paid for is kept.
 */
import { cleanDescription, looksLikeHtml } from '../src/lib/catalogue/description'
import { rewriteDescription } from '../src/lib/catalogue/rewrite-description'
import { getImportedProducts, addImportedProducts } from '../src/lib/portal/store'
import type { CatalogueProduct } from '../src/lib/catalogue/types'

const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const USE_AI = args.includes('--ai')
const LIMIT = (() => {
  const i = args.indexOf('--limit')
  if (i === -1) return Infinity
  const n = Number(args[i + 1])
  return Number.isFinite(n) && n > 0 ? n : Infinity
})()

function preview(text: string, width = 100): string {
  const oneLine = text.replace(/\n/g, ' ⏎ ')
  return oneLine.length > width ? `${oneLine.slice(0, width)}…` : oneLine
}

async function main(): Promise<void> {
  if (USE_AI && !process.env.OPENAI_API_KEY) {
    console.error('--ai needs OPENAI_API_KEY set. Without it every product would fall back to the plain clean.')
    process.exit(1)
  }

  const products = await getImportedProducts()
  console.log(`${products.length} imported products.`)

  // With --ai every product is a candidate (the voice needs fixing even where
  // the markup does not); without it, only the ones still carrying markup.
  const candidates = products
    .filter((p) => (USE_AI ? Boolean(p.description?.trim()) : looksLikeHtml(p.description)))
    .slice(0, LIMIT === Infinity ? undefined : LIMIT)

  const withMarkup = products.filter((p) => looksLikeHtml(p.description)).length
  console.log(`${withMarkup} still carry raw markup.`)
  console.log(`${candidates.length} to process${USE_AI ? ' (AI rewrite)' : ' (markup strip)'}.`)
  if (!WRITE) console.log('\nDRY RUN — nothing will be saved. Re-run with --write to apply.\n')

  const changed: CatalogueProduct[] = []
  const counts = { unchanged: 0, ai: 0, fallback: 0 }

  for (const [i, product] of candidates.entries()) {
    const position = `[${i + 1}/${candidates.length}]`

    let next: string
    if (USE_AI) {
      const result = await rewriteDescription({
        title: product.title,
        category: product.category,
        description: product.description,
      })
      next = result.text
      if (result.source === 'ai') {
        counts.ai += 1
      } else {
        counts.fallback += 1
        const detail = result.flags?.length
          ? `${result.reason} (${result.flags.map((f) => `"${f.match}" — ${f.why}`).join(', ')})`
          : result.reason
        console.log(`${position} ${product.title}\n   fell back to the plain clean: ${detail}`)
      }
    } else {
      next = cleanDescription(product.description)
    }

    if (next === product.description) {
      counts.unchanged += 1
      continue
    }

    console.log(`${position} ${product.title}`)
    console.log(`   before: ${preview(product.description)}`)
    console.log(`   after:  ${preview(next)}`)

    const updated = { ...product, description: next }
    changed.push(updated)

    // Written one at a time so an interrupted --ai run keeps the calls already
    // paid for. The markup-only pass is cheap enough to batch at the end.
    if (WRITE && USE_AI) await addImportedProducts([updated])
  }

  if (WRITE && !USE_AI && changed.length > 0) await addImportedProducts(changed)

  console.log('\n─────────────────────────────')
  console.log(`Changed:    ${changed.length}`)
  console.log(`Unchanged:  ${counts.unchanged}`)
  if (USE_AI) {
    console.log(`AI rewrite: ${counts.ai}`)
    console.log(`Fell back:  ${counts.fallback}`)
  }
  console.log(WRITE ? 'Saved.' : 'Dry run — nothing saved.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
