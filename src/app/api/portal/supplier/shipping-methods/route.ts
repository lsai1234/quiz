import { NextResponse } from 'next/server'
import { getSupplier, getSupplierSource } from '@/lib/supplier'
import { isPortalAuthed } from '@/lib/portal/guard'
import { syncPortalRuntime } from '@/lib/portal/store'
import { CARRIERS, getTransportCodes, rememberShippingMethods, setTransportCode } from '@/lib/supplier/transport'
import type { DeliveryCarrier } from '@/lib/stack-blueprint/pricing'

export const dynamic = 'force-dynamic'

/**
 * GET  /api/portal/supplier/shipping-methods → { source, codes, methods, checkedAt, error? }
 * POST { carrier, code } → the same, with that carrier's code chosen (empty: back to detection)
 *
 * The service codes every order asks PowerBody for: Royal Mail Tracked 48 up
 * to 7 kg, DPD above (`lib/supplier/transport.ts`). GET asks PowerBody for the
 * account's services when the supplier is live, and keeps the codes it finds.
 */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await syncPortalRuntime()
  const source = getSupplierSource()
  if (source !== 'powerbody') return NextResponse.json({ source, ...(await getTransportCodes()) })

  const supplier = await getSupplier()
  if (!supplier.shippingMethods) return NextResponse.json({ source, ...(await getTransportCodes()) })
  try {
    return NextResponse.json({ source, ...(await rememberShippingMethods(await supplier.shippingMethods())) })
  } catch (err) {
    // Their own words are the diagnosis — "Resource path is not callable" means
    // the method is not enabled on this account, an account-manager question.
    return NextResponse.json({ source, ...(await getTransportCodes()), error: err instanceof Error ? err.message : String(err) })
  }
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { carrier?: unknown; code?: unknown } | null
  const carrier = body?.carrier as DeliveryCarrier
  if (!CARRIERS.includes(carrier)) return NextResponse.json({ error: 'Unknown carrier' }, { status: 400 })
  const code = typeof body?.code === 'string' ? body.code.slice(0, 64) : null
  return NextResponse.json({ source: getSupplierSource(), ...(await setTransportCode(carrier, code)) })
}
