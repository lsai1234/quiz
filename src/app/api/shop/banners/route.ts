import { NextResponse } from 'next/server'
import { listBanners } from '@/lib/db/shop-banners'
import { visibleBanners } from '@/lib/shop/banners'

/**
 * The banners the shop should render.
 *
 * Metadata only — the artwork comes from `/api/shop/banner/[id]`, so this
 * response is a few hundred bytes and can be fetched on every shop load without
 * shipping megabytes of base64 to decide what to draw.
 *
 * Inactive and over-cap banners are filtered HERE rather than in the component,
 * so a banner a founder has switched off never reaches the browser at all.
 *
 * Never throws: a shop whose banner table is unreadable should open on its goal
 * row, not on an error. An empty list is a perfectly good answer and the shell
 * already renders the default banner when it gets one.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const all = await listBanners()
    return NextResponse.json({ banners: visibleBanners(all) })
  } catch {
    return NextResponse.json({ banners: [] })
  }
}
