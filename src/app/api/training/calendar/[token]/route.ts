import { appBaseUrl } from '@/lib/notify'
import { getUserById } from '@/lib/db/users'
import { trainingAccess } from '@/lib/training/access'
import { trainingCalendar } from '@/lib/training/calendar'
import { getTraining } from '@/lib/training/store'
import { userForCalendar } from '@/lib/training/live-calendar'
import { rollWeek } from '@/lib/training/edit'

/**
 * GET /api/training/calendar/<key>: a member's live training calendar, for a
 * calendar app to subscribe to. No sign-in (calendar apps can't), so the key
 * is the only way in; it follows every change to the plan, and stops working
 * when the member replaces it or their hub closes.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const headers = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' }

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, '')
  const userId = await userForCalendar(token)
  const user = userId ? await getUserById(userId) : null
  if (!user) return new Response('Not found', { status: 404, headers })
  if (!(await trainingAccess(user)).allowed) return new Response('Not open', { status: 404, headers })
  const { plan } = await getTraining(user.id)
  if (!plan || plan.calendarToken !== token) return new Response('Not found', { status: 404, headers })
  return new Response(trainingCalendar(rollWeek(plan, new Date()), appBaseUrl()), {
    headers: { ...headers, 'content-type': 'text/calendar; charset=utf-8' },
  })
}
