import { NextResponse } from 'next/server'
import { kvDelete, kvListPrefix } from '@/lib/db/kv'
import { readAiLog, summariseAiLog } from '@/lib/consult/ai/audit'
import { COPY_TARGET_MS } from '@/lib/consult/ai/copy'
import type { HandoffPayload } from '@/lib/consult/handoff'
import { isPortalAuthed } from '@/lib/portal/guard'

/**
 * The consult viewer and AI log, for the Founders Hub (plan p.11, "Oversight").
 *
 *   GET            saved consults from the last 30 days, and the AI log's
 *                  last 7 days (a summary per route, and the latest calls)
 *   DELETE ?id=    delete one saved consult — deletion on request, under
 *                  UK GDPR, for special category data
 *
 * Saved consults are the handoff payloads: goals, a coarse profile, the three
 * SKU lists, what was kept out and the pharmacist flag. The circuit-check
 * answers themselves are never stored, so there's nothing more to show.
 */

export const dynamic = 'force-dynamic'

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000

interface Stored {
  savedAt: number
  payload: HandoffPayload
}

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'founders only' }, { status: 401 })
  const now = Date.now()
  const rows = await kvListPrefix<Stored>('consult:', 500)
  const consults = rows
    .filter((r) => r.value?.payload && now - r.value.savedAt <= RETENTION_MS)
    .map((r) => ({ savedAt: r.value.savedAt, payload: r.value.payload }))
    .sort((a, b) => b.savedAt - a.savedAt)
  const log = await readAiLog(7, now)
  return NextResponse.json({
    consults,
    ai: { targetMs: COPY_TARGET_MS, summary: summariseAiLog(log), recent: log.slice(0, 50) },
  })
}

export async function DELETE(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'founders only' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!/^c_[a-z0-9]{6,32}$/.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  await kvDelete(`consult:${id}`)
  return NextResponse.json({ ok: true })
}
