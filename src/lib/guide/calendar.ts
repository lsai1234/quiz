/**
 * Reminders (Option 3) as a calendar file: one daily event at each timed moment
 * on their day, with an alert at the time. No SMS provider and no app needed:
 * Apple, Google and Outlook calendars all open an .ics.
 *
 * Products taken only on training days repeat on those weekdays when they said
 * which; otherwise they are left out of the calendar rather than guessed onto
 * days. The words are the guide's (`GUIDE_COPY`), and say only when and what.
 */
import type { StackGuide } from './build'
import { GUIDE_COPY } from './copy'

const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

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

const pad = (n: number) => String(n).padStart(2, '0')

export function guideCalendar(guide: StackGuide, now = new Date()): string {
  const start = new Date(`${guide.createdAt.slice(0, 10)}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() + 1)
  const date = `${start.getUTCFullYear()}${pad(start.getUTCMonth() + 1)}${pad(start.getUTCDate())}`
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const weekdays = guide.routine.day.trainWeekdays

  const events: string[][] = []
  for (const moment of guide.routine.moments) {
    if (moment.minutes === null) continue
    const daily = moment.items.filter((i) => i.days === 'every-day' || i.days === 'most-days')
    const training = moment.items.filter((i) => i.days === 'training-days')
    const groups: { items: typeof daily; rule: string }[] = []
    if (daily.length) groups.push({ items: daily, rule: 'FREQ=DAILY' })
    if (training.length && weekdays?.length) groups.push({ items: training, rule: `FREQ=WEEKLY;BYDAY=${weekdays.map((d) => BYDAY[d]).join(',')}` })
    for (const [n, g] of groups.entries()) {
      const time = `${pad(Math.floor(moment.minutes / 60))}${pad(moment.minutes % 60)}00`
      const title = GUIDE_COPY.reminderTitle(moment.label, g.items.map((i) => i.title).join(', '))
      events.push([
        'BEGIN:VEVENT',
        `UID:${guide.token}-${moment.minutes}-${n}@chrgd`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=Europe/London:${date}T${time}`,
        'DURATION:PT10M',
        `RRULE:${g.rule}`,
        `SUMMARY:${esc(title)}`,
        `DESCRIPTION:${esc(GUIDE_COPY.reminderBody)}`,
        'TRANSP:TRANSPARENT',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${esc(title)}`,
        'TRIGGER:PT0M',
        'END:VALARM',
        'END:VEVENT',
      ])
    }
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CHRGD//Stack guide//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(GUIDE_COPY.calendarName)}`,
    'X-WR-TIMEZONE:Europe/London',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/London',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0000',
    'TZOFFSETTO:+0100',
    'TZNAME:BST',
    'DTSTART:19700329T010000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0000',
    'TZNAME:GMT',
    'DTSTART:19701025T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
    ...events.flat(),
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}
