import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { substituteException, skipException, notifyException } from '@/lib/stock/service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/portal/stock-alerts/[id]  Body: { action, replacementProductId? }
 * action ∈ substitute | skip | notify.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  let body: { action?: string; replacementProductId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  try {
    switch (body.action) {
      case 'substitute': {
        if (!body.replacementProductId) return NextResponse.json({ error: 'replacementProductId is required' }, { status: 400 })
        const { exception } = await substituteException(id, body.replacementProductId)
        return NextResponse.json({ ok: true, exception })
      }
      case 'skip': {
        const { exception } = await skipException(id)
        return NextResponse.json({ ok: true, exception })
      }
      case 'notify': {
        const { exception } = await notifyException(id)
        return NextResponse.json({ ok: true, exception })
      }
      default:
        return NextResponse.json({ error: 'action must be substitute | skip | notify' }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Action failed' }, { status: 400 })
  }
}
