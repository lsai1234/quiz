/**
 * Backfill product descriptions that were imported before the import path
 * cleaned them.
 *
 *   npx tsx scripts/clean-descriptions.ts                 # report only
 *   npx tsx scripts/clean-descriptions.ts --write         # strip the markup
 *   npx tsx scripts/clean-descriptions.ts --write --ai    # …and rewrite in our voice
 *   npx tsx scripts/clean-descriptions.ts --write --ai --limit 5
 *
 * The same job is in the Founders Hub, under Products → PowerBody, and both run
 * `lib/catalogue/description-cleanup` — there is one implementation on purpose.
 * This exists for the cases a browser tab is wrong for: a first pass over a
 * freshly imported roster, a scripted re-run, or an `--ai` sweep long enough
 * that you would rather watch it in a terminal than a panel.
 *
 * DRY RUN BY DEFAULT
 * ──────────────────
 * Nothing is written without `--write`. The report prints before and after for
 * every product it would change, because a bad rewrite is far easier to catch
 * reading a diff than reading a catalogue.
 *
 * SAFE TO RE-RUN
 * ──────────────
 * `cleanDescription` is idempotent and a product already holding what we would
 * write is skipped, so a second run is a no-op. `--ai` writes per batch, so an
 * interrupted sweep keeps the calls it has already paid for.
 */
import { cleanupDescriptions, scanDescriptions } from '../src/lib/catalogue/description-cleanup'
import type { DescriptionChange } from '../src/lib/catalogue/description-cleanup'

const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const USE_AI = args.includes('--ai')
const LIMIT = (() => {
  const i = args.indexOf('--limit')
  if (i === -1) return Infinity
  const n = Number(args[i + 1])
  return Number.isFinite(n) && n > 0 ? n : Infinity
})()

/** Written per batch so an interrupted `--ai` run keeps what it paid for. */
const BATCH = 10

function preview(text: string, width = 100): string {
  const line = text.replace(/\n/g, ' ⏎ ')
  return line.length > width ? `${line.slice(0, width)}…` : line
}

function report(change: DescriptionChange, position: string): void {
  console.log(`${position} ${change.title}`)
  console.log(`   before: ${preview(change.before)}`)
  console.log(`   after:  ${preview(change.after)}`)
  if (change.source === 'cleaned' && change.reason) {
    const detail = change.flags?.length
      ? `${change.reason} (${change.flags.map((f) => `"${f.match}" — ${f.why}`).join(', ')})`
      : change.reason
    console.log(`   kept the supplier's words: ${detail}`)
  }
}

async function main(): Promise<void> {
  if (USE_AI && !process.env.OPENAI_API_KEY) {
    console.error('--ai needs OPENAI_API_KEY set. Without it every product would fall back to the plain clean.')
    process.exit(1)
  }

  const scan = await scanDescriptions()
  console.log(`${scan.total} imported products, ${scan.withDescription} with a description.`)
  console.log(`${scan.withMarkup} still carry raw markup.`)

  // With --ai every described product is a candidate: the voice needs fixing
  // even where the markup does not. Without it, only the ones carrying markup.
  const ids = scan.candidates
    .filter((c) => (USE_AI ? true : c.hasMarkup))
    .map((c) => c.id)
    .slice(0, LIMIT === Infinity ? undefined : LIMIT)

  console.log(`${ids.length} to process${USE_AI ? ' (AI rewrite)' : ' (markup strip)'}.`)
  if (!WRITE) console.log('\nDRY RUN — nothing will be saved. Re-run with --write to apply.\n')

  let changed = 0
  let unchanged = 0
  let aiUsed = 0
  let fellBack = 0

  for (let i = 0; i < ids.length; i += BATCH) {
    const result = await cleanupDescriptions({ ids: ids.slice(i, i + BATCH), ai: USE_AI, write: WRITE })
    result.changes.forEach((c, n) => report(c, `[${i + n + 1}/${ids.length}]`))
    changed += result.changes.length
    unchanged += result.unchanged
    aiUsed += result.aiUsed
    fellBack += result.fellBack
  }

  console.log('\n─────────────────────────────')
  console.log(`Changed:    ${changed}`)
  console.log(`Unchanged:  ${unchanged}`)
  if (USE_AI) {
    console.log(`AI rewrite: ${aiUsed}`)
    console.log(`Fell back:  ${fellBack}`)
  }
  console.log(WRITE ? 'Saved.' : 'Dry run — nothing saved.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
