import { NextResponse } from 'next/server'
import { getDataSourceSetting, getPortalPricingOverrides, syncPortalRuntime } from '@/lib/portal/store'
import { getPaymentSource } from '@/lib/payments'

// Public, non-sensitive config so the customer-facing client can mirror the
// portal's runtime data-source mode and pricing overrides (see PortalSync).
export const dynamic = 'force-dynamic'

export async function GET() {
  await syncPortalRuntime()
  return NextResponse.json({
    dataSourceMode: await getDataSourceSetting(),
    pricingOverrides: await getPortalPricingOverrides(),
    /**
     * Whether checkout will take real money. The decision itself stays
     * server-side — this is only so the UI can say "Demo checkout" rather than
     * "Checkout" honestly, without importing a payments module into the browser.
     * A boolean, not the mode or the credentials: nothing here is a secret and
     * nothing here can be used to change the outcome.
     */
    paymentsLive: getPaymentSource() === 'stripe',
  })
}
