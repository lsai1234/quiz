import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getPortalPricingOverrides, setPortalPricingOverrides, resetPortalPricing } from '@/lib/portal/store'
import { PRICING_CONFIG, getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({
    defaults: PRICING_CONFIG,
    overrides: getPortalPricingOverrides(),
    current: getPricingConfig(),
  })
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { overrides?: Partial<PricingConfig>; reset?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (body.reset) {
    resetPortalPricing()
  } else {
    setPortalPricingOverrides(body.overrides ?? {})
  }
  return NextResponse.json({ overrides: getPortalPricingOverrides(), current: getPricingConfig() })
}
