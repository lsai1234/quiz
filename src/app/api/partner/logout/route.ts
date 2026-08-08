import { NextResponse } from 'next/server'
import { endPartnerSession } from '@/lib/partners/auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  await endPartnerSession()
  return NextResponse.json({ ok: true })
}
