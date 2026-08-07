import { NextResponse } from 'next/server'
import { isPortalAuthed, getFounder } from '@/lib/portal/guard'
import { listAwaitingFulfilment } from '@/lib/orders/repo'
import { buildFulfilmentQueue, type QueueKind } from '@/lib/orders/queue'
import { syncPortalRuntime } from '@/lib/portal/store'
import { getOrderingSource } from '@/lib/supplier/ordering'
import {
  approveOrderForSupplier,
  holdOrder,
  rejectOrderForFulfilment,
  returnOrderToQueue,
  submitOrderToSupplier,
} from '@/lib/orders/service'

export const dynamic = 'force-dynamic'

/**
 * The daily supplier review queue.
 *
 * GET  /api/portal/fulfilment?kind=one-off|subscription — everything paid but
 *      not yet sent to PowerBody, grouped by the day it was raised.
 * POST /api/portal/fulfilment  { ids, action }          — decide on one or many.
 *
 * `send` is the only action that talks to the supplier, and it only works on
 * orders a founder has already approved — the gate lives in the orders domain
 * (`submitOrderToSupplier`), so this route cannot bypass it.
 */
export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Hydrate the runtime settings so `ordering` below reflects the portal's
  // current choice on this instance, not whatever it booted with.
  await syncPortalRuntime()
  const kind = new URL(req.url).searchParams.get('kind')
  const orders = await listAwaitingFulfilment()
  const queue = buildFulfilmentQueue(
    orders,
    kind === 'one-off' || kind === 'subscription' ? (kind as QueueKind) : undefined,
  )
  // The queue's Send button is the one place a real parcel gets triggered, so it
  // says which mode it is about to send in rather than making the founder
  // remember what Settings is set to.
  return NextResponse.json({ ...queue, ordering: getOrderingSource() })
}

type Action = 'approve' | 'hold' | 'reject' | 'return' | 'send' | 'approve-and-send'

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { ids?: unknown; action?: unknown; note?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((i): i is string => typeof i === 'string') : []
  const action = body.action as Action
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null
  if (ids.length === 0) return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })

  const founder = await getFounder()
  const by = founder?.name ?? null

  const failures: { id: string; error: string }[] = []
  let done = 0

  for (const id of ids) {
    try {
      switch (action) {
        case 'approve':
          await approveOrderForSupplier(id, by, note)
          break
        case 'hold':
          await holdOrder(id, by, note)
          break
        case 'reject':
          await rejectOrderForFulfilment(id, by, note)
          break
        case 'return':
          await returnOrderToQueue(id, by, note)
          break
        case 'send':
          await submitOrderToSupplier(id)
          break
        case 'approve-and-send':
          await approveOrderForSupplier(id, by, note)
          await submitOrderToSupplier(id)
          break
        default:
          return NextResponse.json(
            { error: 'action must be approve | hold | reject | return | send | approve-and-send' },
            { status: 400 },
          )
      }
      done += 1
    } catch (err) {
      // One bad order must not abandon the rest of the day's queue.
      failures.push({ id, error: err instanceof Error ? err.message : 'Action failed' })
    }
  }

  const queue = buildFulfilmentQueue(await listAwaitingFulfilment())
  return NextResponse.json({
    ok: failures.length === 0,
    done,
    failures,
    queue: { ...queue, ordering: getOrderingSource() },
    // So the UI can say "3 orders simulated" rather than "3 orders sent" — the
    // difference matters more than any other word in this screen.
    ordering: getOrderingSource(),
  })
}
