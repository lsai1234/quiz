import { NextResponse } from 'next/server'
import { getDataSourceSetting, getPortalPricingOverrides } from '@/lib/portal/store'

// Public, non-sensitive config so the customer-facing client can mirror the
// portal's runtime data-source mode and pricing overrides (see PortalSync).
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    dataSourceMode: await getDataSourceSetting(),
    pricingOverrides: await getPortalPricingOverrides(),
  })
}
