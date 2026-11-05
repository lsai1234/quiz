import { getHubUser } from '@/lib/auth/session'
import { appBaseUrl } from '@/lib/notify'
import { trainingAccess } from '@/lib/training/access'
import { trainingCalendar } from '@/lib/training/calendar'
import { getTraining } from '@/lib/training/store'

/** GET /api/hub/training/calendar: the member's training week as a calendar file. */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const headers = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' }

export async function GET() {
  const user = await getHubUser()
  if (!user) return new Response('Not signed in', { status: 401, headers })
  if (!(await trainingAccess(user)).allowed) return new Response('Not open', { status: 403, headers })
  const { plan } = await getTraining(user.id)
  if (!plan) return new Response('No plan yet', { status: 404, headers })
  return new Response(trainingCalendar(plan, appBaseUrl()), {
    headers: { ...headers, 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="chrgd-training-week.ics"' },
  })
}
