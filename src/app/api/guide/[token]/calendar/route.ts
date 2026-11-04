import { getGuide } from '@/lib/guide/store'
import { guideCalendar } from '@/lib/guide/calendar'

/**
 * The stack guide's reminders, as a calendar file (Option 3). The token is
 * the only key; nothing is cached anywhere shared.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const guide = await getGuide(token)
  if (!guide) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
  return new Response(guideCalendar(guide), {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'attachment; filename="chrgd-your-day.ics"',
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}
