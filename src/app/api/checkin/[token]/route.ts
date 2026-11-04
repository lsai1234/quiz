import { NextResponse } from 'next/server'
import { getGuide } from '@/lib/guide/store'
import { getCheckIns, saveCheckIns } from '@/lib/checkin/store'
import { normaliseAnswer } from '@/lib/checkin/model'
import { checkInView } from '@/lib/checkin/view'

/**
 * Amp's check-in for one box (Option 2). The guide's token is the only key.
 *
 *   GET                       the box's products, answers so far, suggestions
 *   POST { answer }           add a check-in (checked against the box)
 *   POST { stop: true }       no more check-in emails for this box
 *
 * Answers are about the box, never health (see `lib/checkin/copy`). At most one
 * answer is kept per day: a second the same day replaces the first.
 */
export const dynamic = 'force-dynamic'

const MAX_ANSWERS = 40

async function load(token: string) {
  const [record, guide] = await Promise.all([getCheckIns(token), getGuide(token)])
  return record && guide ? { record, guide } : null
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const found = await load(token)
  if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: { 'cache-control': 'no-store' } })
  return NextResponse.json(checkInView(found.record, found.guide), { headers: { 'cache-control': 'no-store' } })
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const found = await load(token)
  if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  let body: { answer?: unknown; stop?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const now = new Date().toISOString()
  const { record, guide } = found
  if (body.stop === true) {
    const next = { ...record, stopped: true, lastActivity: now }
    await saveCheckIns(next)
    return NextResponse.json(checkInView(next, guide))
  }
  const answer = normaliseAnswer(body.answer, guide.products.map((p) => p.id), now)
  const today = now.slice(0, 10)
  const answers = [...record.answers.filter((a) => a.at.slice(0, 10) !== today), answer].slice(-MAX_ANSWERS)
  const next = { ...record, answers, lastActivity: now }
  await saveCheckIns(next)
  return NextResponse.json(checkInView(next, guide))
}
