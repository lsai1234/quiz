/**
 * The daily job's check-ins: send the ones that are due, stop a plan's once it
 * has ended, and delete records a year after anything last happened on them.
 * Each email goes through the outbox (deduped per send, and held to the test
 * allowlist until payments are live). Never throws.
 */
import { appBaseUrl } from '@/lib/notify'
import { addDays, EVERY_DAYS, isDue, MAX_SENDS, type CheckInRecord } from './model'
import { deleteCheckIns, listCheckIns, saveCheckIns } from './store'

const YEAR_MS = 366 * 24 * 60 * 60 * 1000

export function checkInLinks(token: string, base = appBaseUrl()) {
  return { checkIn: `${base}/checkin/${token}`, stop: `${base}/checkin/${token}?stop=1`, base }
}

export async function sweepCheckIns(now = new Date()): Promise<{ sent: number; stopped: number; deleted: number }> {
  const result = { sent: 0, stopped: 0, deleted: 0 }
  try {
    const { getOfferSettings } = await import('@/lib/offer/store')
    const on = (await getOfferSettings()).services.checkIns
    const today = now.toISOString().slice(0, 10)
    for (const record of await listCheckIns()) {
      try {
        if (now.getTime() - new Date(record.lastActivity).getTime() > YEAR_MS) {
          await deleteCheckIns(record.token)
          result.deleted++
          continue
        }
        if (!on || !isDue(record, today)) continue
        if (record.plan === 'subscription' && record.userId && !(await planActive(record.userId))) {
          await saveCheckIns({ ...record, stopped: true })
          result.stopped++
          continue
        }
        await send(record)
        await saveCheckIns({ ...record, sent: record.sent + 1, nextDue: addDays(today, EVERY_DAYS) })
        result.sent++
      } catch (err) {
        console.error('[checkin] one check-in failed:', err)
      }
    }
  } catch (err) {
    console.error('[checkin] sweep failed:', err)
  }
  return result
}

async function planActive(userId: string): Promise<boolean> {
  const { getSubscription } = await import('@/lib/db/hub-data')
  const sub = await getSubscription(userId)
  return Boolean(sub && sub.status !== 'cancelled')
}

async function send(record: CheckInRecord): Promise<void> {
  const [{ queueNotification, deliverIfAutomatic }, { checkInEmail }] = await Promise.all([import('@/lib/notify/outbox'), import('./email')])
  const queued = await queueNotification({
    userId: record.userId,
    email: record.email,
    template: 'check-in',
    dedupeKey: `check-in:${record.token}:${record.sent + 1}`,
    rendered: checkInEmail(record, checkInLinks(record.token)),
  })
  await deliverIfAutomatic(queued)
}

export { MAX_SENDS }
