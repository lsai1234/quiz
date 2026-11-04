import { buildGuide, guideClaims, normaliseGuideSeed, servingOf } from '../build'
import { guideCalendar } from '../calendar'
import { stackGuideEmail } from '../email'
import { GUIDE_COPY } from '../copy'
import { CLAIMS } from '@/lib/consult/claims'
import { MOCK_CATALOGUE } from '@/lib/catalogue'

const byId = (id: string) => MOCK_CATALOGUE.find((p) => p.id === id)!
const ids = ['chrgd-creatine', 'chrgd-omega-3', 'chrgd-pre-workout', 'chrgd-magnesium'].filter((id) => MOCK_CATALOGUE.some((p) => p.id === id))
const seed = normaliseGuideSeed({
  day: { wake: 390, bed: 1350, trainAt: 1080, trainDays: 3, trainWeekdays: [0, 2, 4], assumed: false },
  goals: ['muscle', 'not-a-goal'],
  firstName: '  alex smith<script>',
  stackName: 'Wired and tired',
})
const guide = buildGuide({ token: 'abcdefghijklmnopqrstuvwx', now: '2026-11-04T10:00:00.000Z', plan: 'oneoff', lines: ids.map((productId) => ({ productId })), seed, catalogue: MOCK_CATALOGUE, services: ['Your stack guide'] })

describe('the stack guide: their products on their day, and only approved words', () => {
  it('keeps the checkout’s seed to what it may use', () => {
    expect(seed.firstName).toBe('Alex')
    expect(seed.goals).toEqual(['muscle'])
    expect(seed.day.trainWeekdays).toEqual([0, 2, 4])
  })

  it('places every product on their day, with its moment and how often', () => {
    expect(guide.products.map((p) => p.id)).toEqual(ids)
    for (const p of guide.products) {
      expect(p.moment).toBeTruthy()
      expect(p.daysLabel).toBeTruthy()
    }
    expect(guide.checkInOn).toBe('2026-11-18')
  })

  it('quotes only register claims, word for word, each with its condition of use', () => {
    const register = new Set(Object.values(CLAIMS).map((c) => c.wording))
    for (const p of guide.products) for (const c of p.claims) expect(register.has(c.wording)).toBe(true)
    // A kind with no authorised claim carries none.
    expect(guideClaims(byId(ids.find((id) => id.includes('pre-workout')) ?? ids[0]), [])).toBeDefined()
  })

  it('takes serving amounts only from the catalogue', () => {
    expect(servingOf({ actives: [{ name: 'Creatine', mg: 5000 }, { name: 'Taurine', mg: 250 }] })).toBe('Creatine 5 g · Taurine 250 mg')
    expect(servingOf({ actives: [] })).toBeNull()
  })

  it('makes a calendar with daily reminders and training days on their weekdays', () => {
    const ics = guideCalendar(guide, new Date('2026-11-04T10:00:00Z'))
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('RRULE:FREQ=DAILY')
    if (guide.routine.items.some((i) => i.days === 'training-days' && i.minutes !== null)) expect(ics).toContain('BYDAY=MO,WE,FR')
    expect(ics).toContain('DTSTART;TZID=Europe/London:20261105T')
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75)
  })

  it('emails the image, then the same content as text, with no marketing', () => {
    const email = stackGuideEmail(guide, { page: 'https://x.test/stack-guide/t', image: 'https://x.test/api/guide/t/image', calendar: 'https://x.test/api/guide/t/calendar' }, { baseUrl: 'https://x.test' })
    expect(email.subject).toBe(GUIDE_COPY.emailSubject('Alex'))
    expect(email.html).toContain('src="https://x.test/api/guide/t/image"')
    expect(email.html).toContain(`alt="${GUIDE_COPY.imageAlt(guide.products.length)}"`)
    for (const p of guide.products) expect(email.text).toContain(p.short)
    expect(email.text).toContain('Wednesday 18 November')
    expect(email.html).not.toContain('<script>')
  })

  it('never predicts what they will feel', () => {
    const words = JSON.stringify(GUIDE_COPY).toLowerCase()
    for (const w of ['you’ll feel', "you'll feel", 'you will feel', 'within a few weeks', 'notice the difference', 'results in', 'boost']) expect(words).not.toContain(w)
  })
})
