import { NextResponse } from 'next/server'
import { getSupplier, getSupplierSource } from '@/lib/supplier'
import { isPortalAuthed } from '@/lib/portal/guard'
import { syncPortalRuntime } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

/**
 * GET /api/portal/supplier/shipping-methods → { source, methods, note }
 *
 * What delivery services PowerBody will accept on this account.
 *
 * Diagnostic, not part of the order path: `createOrder` sends an empty
 * `transport_code` and lets them choose, which is fine. This answers the
 * question their documentation does not — whether the account has more than one
 * service at all. Their published rate card reads as ONE service per zone, so
 * until this comes back with two, "delivery options" can only mean prices we
 * set, not speeds we buy.
 *
 * Worth running once when API access lands, and again if they ever say the
 * account has been upgraded.
 */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await syncPortalRuntime()
  const source = getSupplierSource()
  if (source !== 'powerbody') {
    return NextResponse.json({
      source,
      methods: [],
      note: 'The mock supplier has no shipping methods to report. Switch Settings → Supplier to Live PowerBody first.',
    })
  }

  const supplier = await getSupplier()
  if (!supplier.shippingMethods) {
    return NextResponse.json({ source, methods: [], note: 'This provider does not report shipping methods.' })
  }

  try {
    const methods = await supplier.shippingMethods()
    return NextResponse.json({
      source,
      methods,
      note:
        methods.length > 1
          ? `${methods.length} services available — real delivery choices are possible; wire the chosen code into createOrder's transport_code.`
          : 'One service or none, which matches their published rate card. Delivery choices can only be prices we set, not speeds we buy.',
    })
  } catch (err) {
    // Their own words are the diagnosis — "Resource path is not callable" means
    // the method is not enabled on this account, which is an account-manager
    // question rather than a bug.
    return NextResponse.json(
      { source, methods: [], error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }
}
