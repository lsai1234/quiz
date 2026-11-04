/**
 * Start Amp's check-ins for a box, when its guide is issued (`lib/guide/issue`).
 * Only with an address to write to, and only while check-ins are switched on in
 * the Founders Hub. Once per box: an existing record is left alone.
 */
import type { StackGuide } from '@/lib/guide/build'
import type { CheckInRecord } from './model'
import { getCheckIns, saveCheckIns } from './store'

export async function registerCheckIns(
  guide: StackGuide,
  who: { email: string | null; userId: string | null; orderId: string | null },
): Promise<CheckInRecord | null> {
  try {
    if (!who.email) return null
    const { getOfferSettings } = await import('@/lib/offer/store')
    if (!(await getOfferSettings()).services.checkIns) return null
    const existing = await getCheckIns(guide.token)
    if (existing) return existing
    const now = new Date().toISOString()
    const record: CheckInRecord = {
      v: 1,
      token: guide.token,
      plan: guide.plan,
      userId: who.userId,
      orderId: who.orderId,
      email: who.email,
      firstName: guide.firstName,
      createdAt: now,
      nextDue: guide.checkInOn,
      sent: 0,
      answers: [],
      stopped: false,
      lastActivity: now,
    }
    await saveCheckIns(record)
    return record
  } catch (err) {
    console.error('[checkin] could not start check-ins:', err)
    return null
  }
}
