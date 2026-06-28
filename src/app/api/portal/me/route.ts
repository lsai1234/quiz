import { NextResponse } from 'next/server'
import { getFounder } from '@/lib/portal/guard'

/** Returns the signed-in founder (for the hub header), or 401 when not signed in. */
export async function GET() {
  const founder = await getFounder()
  if (!founder) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ founder })
}
