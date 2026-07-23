import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { listOrders, type OrderFilter } from '@/lib/orders/repo'
import type { OrderChannel, OrderStatus } from '@/lib/orders/types'

export const dynamic = 'force-dynamic'

/** GET /api/portal/orders?status=&channel= — the Founders Hub order list. */
export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const filter: OrderFilter = {}
  const status = url.searchParams.get('status')
  const channel = url.searchParams.get('channel')
  if (status) filter.status = status as OrderStatus
  if (channel) filter.channel = channel as OrderChannel
  const orders = await listOrders(filter)
  return NextResponse.json({ count: orders.length, orders })
}
