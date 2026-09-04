import { NextResponse } from 'next/server'
import { listBanners } from '@/lib/db/shop-banners'
import { bySlot } from '@/lib/shop/banners'

/**
 * The artwork the shop should render, keyed by placement.
 *
 * Metadata only — the artwork comes from `/api/shop/banner/[id]`, so this
 * response is a few hundred bytes and can be fetched on every shop load without
 * shipping megabytes of base64 to decide what to draw.
 *
 * Inactive banners are filtered HERE rather than in the component, so one a
 * founder has switched off never reaches the browser at all. The response is an
 * object keyed by slot because that is how every consumer reads it: each
 * placement asks for its own picture and renders nothing if there is not one.
 *
 * Never throws: a shop whose banner table is unreadable should open on its goal
 * row, not on an error. An empty list is a perfectly good answer and the shell
 * already renders the built masthead when it gets one.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const all = await listBanners()
    return NextResponse.json({ banners: bySlot(all) })
  } catch {
    return NextResponse.json({ banners: {} })
  }
}
