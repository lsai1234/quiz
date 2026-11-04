/** The check-in email: one question, one button, and the way out. */
import { emailShell } from '@/lib/notify/brand'
import type { RenderedEmail } from '@/lib/notify/types'
import { CHECKIN_COPY } from './copy'
import type { CheckInRecord } from './model'

export function checkInEmail(record: Pick<CheckInRecord, 'firstName'>, links: { checkIn: string; stop: string; base: string }): RenderedEmail {
  const c = CHECKIN_COPY
  const shell = emailShell({
    preheader: c.emailPreheader,
    heading: c.emailHeading,
    intro: c.emailIntro,
    paragraphs: [],
    cta: { label: c.emailCta, url: links.checkIn },
    secondaryCta: { label: c.emailStop, url: links.stop },
    links: { base: links.base, optOutUrl: null },
    marketing: null,
  })
  return { subject: c.emailSubject(record.firstName), ...shell }
}
