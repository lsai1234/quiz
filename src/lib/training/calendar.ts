/**
 * The training week as a calendar file: each session repeats weekly on its
 * day, for 12 weeks, at their usual training time (6pm when they didn't say),
 * as long as it takes. Starts this week, or next week for a day already gone.
 * The words are the plan's (`./copy`) and say only what and when.
 */
import { TRAINING_COPY as C } from './copy'
import { mondayOf } from './generate'
import { sessionLength, sessionTitle } from './view'
import type { TrainingPlan } from './types'

const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
const DEFAULT_AT = 18 * 60
const pad = (n: number) => String(n).padStart(2, '0')

/** RFC 5545 text: escape, then fold at 75 octets. */
function esc(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}
function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (Buffer.byteLength(rest, 'utf8') > 75) {
    let cut = 75
    while (Buffer.byteLength(rest.slice(0, cut), 'utf8') > 75) cut--
    out.push(rest.slice(0, cut))
    rest = ' ' + rest.slice(cut)
  }
  out.push(rest)
  return out.join('\r\n')
}

export function trainingCalendar(plan: TrainingPlan, baseUrl: string, now = new Date()): string {
  const monday = new Date(`${mondayOf(now)}T00:00:00Z`)
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const at = plan.prefs.trainAt ?? DEFAULT_AT
  const time = `${pad(Math.floor(at / 60))}${pad(at % 60)}00`
  const events = plan.sessions.map((s, i) => {
    const d = new Date(monday)
    d.setUTCDate(d.getUTCDate() + s.day)
    if (d.getTime() < today) d.setUTCDate(d.getUTCDate() + 7)
    const date = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
    const minutes = sessionLength(s)
    return [
      'BEGIN:VEVENT',
      `UID:training-${plan.userId}-${s.id}-${i}@chrgd`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/London:${date}T${time}`,
      `DURATION:PT${minutes}M`,
      `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[s.day]};COUNT=12`,
      `SUMMARY:${esc(C.calendarEvent(sessionTitle(s), minutes))}`,
      `DESCRIPTION:${esc(`${C.calendarBody} ${baseUrl}/myhub/training`)}`,
      `URL:${baseUrl}/myhub/training`,
      'END:VEVENT',
    ]
  })
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CHRGD//Training plan//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...events.flat(), 'END:VCALENDAR']
    .map(fold)
    .join('\r\n')
}
