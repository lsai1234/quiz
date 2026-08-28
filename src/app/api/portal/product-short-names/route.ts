import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { syncPortalRuntime, setProductOverride } from '@/lib/portal/store'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { deriveShortName, aiShortName, shortNameNeedsWork } from '@/lib/catalogue/short-name'

export const dynamic = 'force-dynamic'
/** The AI pass is an API call per product; a batch of them needs room. */
export const maxDuration = 300

/** Never trust a client-supplied batch size to be sane. */
const MAX_BATCH = 25

/**
 * Short names for the poster and the cards.
 *
 * GET reports what needs doing — free, no API calls, safe on every page load.
 * POST does it, for the ids it is given.
 *
 * Two passes, deliberately separate, exactly as the description cleanup is. The
 * derivation is free, instant and always right about the mechanical part (our
 * brand, the pack size, the sub-clause), so it is the primary action. The AI
 * pass costs a call per product and is a judgement call about what a product is
 * really called, so it is the quieter one — and it shows what it changed.
 *
 * The caller sends ids rather than "do the next N" because a written name is no
 * longer a candidate, so a server that re-decided the set each time would hand
 * back a shrinking list mid-run and the client could not show honest progress.
 */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()
  try {
    const { products } = await getResolvedCatalogue()
    const candidates = products
      .filter(shortNameNeedsWork)
      .map((p) => ({ id: p.id, title: p.title, current: p.shortName ?? null, derived: deriveShortName(p) }))
    return NextResponse.json({
      ok: true,
      total: products.length,
      withShortName: products.length - candidates.length,
      hasKey: !!process.env.OPENAI_API_KEY,
      candidates,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Could not read the catalogue.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()

  const body = await request.json().catch(() => ({}))
  const ai = body?.ai === true
  const ids: unknown = body?.ids

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ ok: false, error: 'Nothing to do — no products were sent.' }, { status: 400 })
  }
  if (ids.length > MAX_BATCH) {
    return NextResponse.json(
      { ok: false, error: `Too many at once — send ${MAX_BATCH} or fewer per request.` },
      { status: 400 },
    )
  }
  // The AI pass needs a key. Without one every product would quietly fall back
  // to the derivation, which looks like the AI ran and agreed with it.
  if (ai && !process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { ok: false, error: 'No OPENAI_API_KEY is set, so there is nothing to call. Filling from titles works without it.' },
      { status: 400 },
    )
  }

  try {
    const wanted = new Set(ids.filter((id): id is string => typeof id === 'string'))
    const { products } = await getResolvedCatalogue()
    const targets = products.filter((p) => wanted.has(p.id))

    const changes = []
    for (const product of targets) {
      const result = ai
        ? await aiShortName(product)
        : { shortName: deriveShortName(product), source: 'derived' as const }
      // A derivation that comes back empty means the title was empty too.
      // Writing "" would replace a usable fallback with a stored blank.
      if (!result.shortName) continue
      await setProductOverride(product.id, { shortName: result.shortName })
      changes.push({
        id: product.id,
        title: product.title,
        before: product.shortName ?? null,
        after: result.shortName,
        source: result.source,
        ...('reason' in result && result.reason ? { reason: result.reason } : {}),
        ...('flags' in result && result.flags ? { flags: result.flags } : {}),
        ...('invented' in result && result.invented ? { invented: result.invented } : {}),
      })
    }
    return NextResponse.json({ ok: true, count: changes.length, changes })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Naming failed.' },
      { status: 500 },
    )
  }
}
