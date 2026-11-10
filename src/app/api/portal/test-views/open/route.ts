import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getFounder, isPortalAuthed } from '@/lib/portal/guard'
import { endHubSession, getHubUser, startHubSession } from '@/lib/auth/session'
import { isSampleEmail, TEST_VIEW_COOKIE } from '@/lib/samples/domain'
import { DEFAULT_TEST_SWITCHES, getTestView, openTestView } from '@/lib/samples/session'
import { setTestViewCookies } from '@/lib/samples/cookies'
import { testViewById } from '@/lib/samples/views'

/**
 * GET /api/portal/test-views/open?view=<id>   (founders only)
 *
 * Opens one test view: starts (or keeps) this browser's test view, sets up
 * its sample data, signs the browser in as the sample member when the view
 * needs one (and out of one when it doesn't), then sends the tab on.
 *
 * Always on to the same address the founder is browsing, never `APP_URL`: the
 * test view's cookies and the sample sign-in are set on this address, so a
 * preview deployment (or www against the bare domain) sent to the live site
 * would land on the plain quiz and a signed-out hub.
 */
export const dynamic = 'force-dynamic'

/** A redirect to a path on this same address (a relative Location, so the browser keeps its host). */
function sameAddress(path: string): NextResponse {
  const safe = path.startsWith('/') && !path.startsWith('//') ? path : '/'
  return new NextResponse(null, { status: 307, headers: { Location: safe, 'Cache-Control': 'no-store' } })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  if (!(await isPortalAuthed())) return sameAddress('/founderhub')
  const def = testViewById(url.searchParams.get('view') ?? '')
  if (!def) return NextResponse.json({ error: 'Unknown test view' }, { status: 404 })

  const jar = await cookies()
  const had = await getTestView(jar.get(TEST_VIEW_COOKIE)?.value)
  const founder = await getFounder().catch(() => null)
  const view = await openTestView(founder?.email ?? 'founder', had?.switches ?? DEFAULT_TEST_SWITCHES, had?.token)
  await setTestViewCookies(view)

  let href = def.href
  if (def.kind === 'member' && def.scenario) {
    const { buildSampleMember } = await import('@/lib/samples/members')
    const { user, guide } = await buildSampleMember(def.scenario)
    await startHubSession(user.id)
    href = href.replace('{guide}', guide ?? '')
  } else {
    // A page that isn't a member's: leave any sample member's session behind.
    const current = await getHubUser().catch(() => null)
    if (current && isSampleEmail(current.email)) await endHubSession()
  }
  return sameAddress(href)
}
