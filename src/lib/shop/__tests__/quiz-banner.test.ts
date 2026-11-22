import { BANNER_EXAMPLES, BANNER_GOALS, bannerDoors, dayX, dotWaves, hhmm, pickDots, placeLabels } from '../quiz-banner'
import { CONSULT_START_HREF, startGoalFrom, startGoalHref, wantsConsult } from '@/lib/quiz-start-goal'

/* A label's width as the banner draws it: "07:30 Creatine" in 12–13px Inter,
   padded, with a 36px capsule beside it on a wide screen. Generous on purpose:
   if these clear, the real ones (narrower) clear too. */
const labelWidth = (hour: number, name: string, wide: boolean) => (hhmm(hour).length + 1 + name.length) * (wide ? 7.6 : 7.1) + 8 + (wide ? 43 : 0)

describe('the quiz banner', () => {
  describe('labels on the day line', () => {
    // A phone's scene (390 wide, less gutters, the bottle and its gap) and a laptop's.
    for (const [screen, width, wide] of [['phone', 270, false], ['laptop', 600, true]] as const) {
      for (const ex of BANNER_EXAMPLES) {
        it(`never overlap for ${ex.who} on a ${screen}`, () => {
          const items = ex.day.map(([h, name]) => ({ x: dayX(h, width), w: labelWidth(h, name, wide) }))
          const placed = placeLabels(items, width)
          for (let i = 0; i < placed.length; i++) {
            for (let j = i + 1; j < placed.length; j++) {
              if (placed[i].row !== placed[j].row) continue
              const [a, b] = [placed[i], placed[j]].sort((p, q) => p.start - q.start)
              const aw = items[placed.indexOf(a)].w
              expect(a.start + aw).toBeLessThanOrEqual(b.start)
            }
          }
          // And stay inside the line, give or take the hang past an end point.
          placed.forEach((p, i) => {
            expect(p.start).toBeGreaterThanOrEqual(-8)
            expect(p.start + items[i].w).toBeLessThanOrEqual(width + 8)
          })
        })
      }
    }

    it('puts a label on the row nearest the line when it fits', () => {
      expect(placeLabels([{ x: 50, w: 60 }, { x: 200, w: 60 }], 300).map((p) => p.row)).toEqual([0, 0])
    })

    it('lifts a label that would touch the one before', () => {
      expect(placeLabels([{ x: 100, w: 80 }, { x: 130, w: 80 }], 300).map((p) => p.row)).toEqual([0, 1])
    })

    it('hangs labels at the ends inwards', () => {
      expect(placeLabels([{ x: 4, w: 80 }, { x: 296, w: 80 }], 300).map((p) => p.align)).toEqual(['l', 'r'])
    })
  })

  describe('the shop as dots', () => {
    it('switches off every dot but the picks, each exactly once', () => {
      for (let ex = 0; ex < BANNER_EXAMPLES.length; ex++) {
        const picks = pickDots(ex, 12, 5)
        expect(picks).toHaveLength(3)
        const waves = dotWaves(ex, 60, picks)
        const off = waves.flat()
        expect(off).toHaveLength(60 - picks.length)
        expect(new Set(off).size).toBe(off.length)
        picks.forEach((p) => expect(off).not.toContain(p))
      }
    })

    it('plays the same way every time', () => {
      expect(dotWaves(1, 60, pickDots(1, 12, 5))).toEqual(dotWaves(1, 60, pickDots(1, 12, 5)))
    })
  })

  it('only names products, never what they do', () => {
    const words = BANNER_EXAMPLES.flatMap((e) => [...e.said, e.phrase, ...e.day.map((d) => d[1])]).join(' ').toLowerCase()
    for (const claim of ['helps', 'boost', 'support', 'improve', 'sleep', 'immun', 'recover']) expect(words).not.toContain(claim)
  })

  it('offers goals the quiz will open with', () => {
    for (const g of BANNER_GOALS) {
      expect(startGoalFrom(new URL(startGoalHref(g.id), 'https://x.test').search)).toBe(g.id)
    }
  })
})

describe('a goal in the quiz link', () => {
  it('accepts a training goal', () => {
    expect(startGoalFrom('?goal=muscle')).toBe('muscle')
    expect(startGoalFrom('?ref=abc&goal=hydration')).toBe('hydration')
  })

  it('ignores anything else', () => {
    expect(startGoalFrom('')).toBeNull()
    expect(startGoalFrom('?goal=sleep-better')).toBeNull()
    expect(startGoalFrom('?goal=<script>')).toBeNull()
  })
})

describe('the banner’s ways in', () => {
  it('opens the quiz with the goal ticked, whichever version the visitor is assigned', () => {
    for (const offer of ['quiz-only', 'both'] as const) {
      const doors = bannerDoors(offer)
      expect(doors.goalHref('muscle')).toBe('/quiz?goal=muscle')
      // Never a version-specific link: `/quiz` serves the visitor's own arm.
      expect(doors.cta.href).toBe('/quiz')
      expect(doors.goalHref('muscle')).not.toMatch(/quizArm/)
    }
  })

  it('offers the consult beside the goals when the quiz page offers it, never in their way', () => {
    expect(bannerDoors('quiz-only').side).toEqual({ label: 'More goals', href: '/quiz', consult: false })
    expect(bannerDoors('both').side).toEqual({ label: 'Or ask Amp', href: CONSULT_START_HREF, consult: true })
  })

  it('sends every way in to the consult for a visitor whose front door it is', () => {
    const doors = bannerDoors('consult-only')
    expect(doors.cta).toEqual({ label: 'Start with Amp', href: CONSULT_START_HREF })
    expect(doors.goalHref('hydration')).toBe(CONSULT_START_HREF)
    expect(doors.side.href).toBe(CONSULT_START_HREF)
    expect(doors.eyebrow).toMatch(/Amp Consult/)
  })

  it('reads the consult start link, and nothing else, as asking for the consult', () => {
    expect(wantsConsult(new URL(CONSULT_START_HREF, 'https://x.test').search)).toBe(true)
    expect(wantsConsult('?start=quiz')).toBe(false)
    expect(wantsConsult('')).toBe(false)
  })
})
