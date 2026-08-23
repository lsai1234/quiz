import { NextResponse } from 'next/server'
import { getFounder, isPortalAuthed } from '@/lib/portal/guard'
import {
  RESET_GROUPS,
  exportBeforeReset,
  lastReset,
  preflight,
  resetPreview,
  runReset,
  type ResetGroupId,
} from '@/lib/portal/go-live'

export const dynamic = 'force-dynamic'

const VALID = new Set<string>(RESET_GROUPS.map((g) => g.id))

function parseGroups(input: unknown): ResetGroupId[] | null {
  if (!Array.isArray(input)) return null
  const groups = input.filter((g): g is ResetGroupId => typeof g === 'string' && VALID.has(g))
  return groups.length > 0 ? groups : null
}

/**
 * GET  /api/portal/go-live         — the checklist, the reset preview, the last reset
 * GET  /api/portal/go-live?export= — the rows a reset would delete, as JSON
 * POST /api/portal/go-live         — run the reset
 *
 * The reset is destructive and irreversible, so POST demands two things beyond
 * the portal session: the explicit list of groups (never "everything"), and the
 * literal confirmation string. Neither is security — anyone with the session
 * could send both — they are there so that a mis-click, a stale tab or a
 * half-remembered curl cannot do it. The thing being guarded against is the
 * founder's own Tuesday afternoon, not an attacker.
 */
export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const exportParam = url.searchParams.get('export')

  if (exportParam) {
    const groups = parseGroups(exportParam.split(',')) ?? RESET_GROUPS.map((g) => g.id)
    const data = await exportBeforeReset(groups)
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), groups, data }, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="chrgd-before-reset-${stamp}.json"`,
      },
    })
  }

  const selected = parseGroups(url.searchParams.get('groups')?.split(',') ?? []) ??
    RESET_GROUPS.filter((g) => g.defaultOn).map((g) => g.id)

  const [checklist, preview, previous] = await Promise.all([preflight(), resetPreview(selected), lastReset()])

  return NextResponse.json({
    groups: RESET_GROUPS,
    checklist,
    preview,
    selected,
    lastReset: previous ?? null,
  })
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { groups?: unknown; confirm?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (body.confirm !== 'RESET') {
    return NextResponse.json({ error: 'Type RESET to confirm.' }, { status: 400 })
  }

  const groups = parseGroups(body.groups)
  if (!groups) {
    return NextResponse.json({ error: 'Choose at least one thing to clear.' }, { status: 400 })
  }

  const founder = await getFounder()
  const result = await runReset(groups, founder?.email ?? null)

  return NextResponse.json({ ok: true, ...result })
}
