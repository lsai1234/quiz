import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import {
  getPortalPricingOverrides,
  setPortalPricingOverrides,
  resetPortalPricing,
  syncPortalRuntime,
} from '@/lib/portal/store'
import { PRICING_CONFIG, getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()
  return NextResponse.json({
    defaults: PRICING_CONFIG,
    overrides: await getPortalPricingOverrides(),
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
    await resetPortalPricing()
  } else {
    await setPortalPricingOverrides(body.overrides ?? {})
  }
  return NextResponse.json({ overrides: await getPortalPricingOverrides(), current: getPricingConfig() })
}
