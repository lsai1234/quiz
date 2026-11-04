import { chargeLevelFor, chargeView } from '../levels'
import { DEFAULT_SERVICES } from '../settings'

const pct = { essentials: 13, performance: 15, complete: 20 } as const
const ratePct = (l: keyof typeof pct) => pct[l]
const ids = (v: ReturnType<typeof chargeView>, unlocked: boolean) => v.services.filter((s) => s.unlocked === unlocked).map((s) => s.id)

describe('charge levels: a bigger box comes with more', () => {
  it('names the box by size, on the same steps as the monthly rate', () => {
    expect([1, 3, 4, 5, 6, 9].map(chargeLevelFor)).toEqual(['charged', 'charged', 'supercharged', 'supercharged', 'fully', 'fully'])
  })

  it('gives a one-off box the services that need no partner, and no levels to climb while the partner ones are off', () => {
    const v = chargeView({ count: 2, plan: 'oneoff', services: DEFAULT_SERVICES, ratePct })
    expect(ids(v, true)).toEqual(['guide', 'reminders', 'checkIns'])
    expect(v.levels).toEqual([])
    expect(v.next).toBeNull()
  })

  it('climbs on a one-off box too once a partner service is on', () => {
    const v = chargeView({ count: 2, plan: 'oneoff', services: { ...DEFAULT_SERVICES, pharmacistCheck: true, vitaminDTest: true }, ratePct })
    expect(v.levels.map((l) => l.id)).toEqual(['charged', 'supercharged', 'fully'])
    expect(v.next).toEqual({ id: 'supercharged', name: 'Supercharged', more: 2 })
    expect(ids(v, false)).toEqual(['pharmacistCheck', 'vitaminDTest'])
  })

  it('names the monthly rate it is on and the next one', () => {
    const v = chargeView({ count: 4, plan: 'subscription', services: DEFAULT_SERVICES, ratePct })
    expect(v.level).toBe('supercharged')
    expect(v.services.filter((s) => s.id === 'rate').map((s) => [s.label, s.unlocked])).toEqual([
      ['15% off every month', true],
      ['20% off every month', false],
    ])
    expect(ids(v, true)).toContain('swaps')
    expect(v.next).toEqual({ id: 'fully', name: 'Fully charged', more: 2 })
  })

  it('never mentions a service that is switched off', () => {
    const v = chargeView({ count: 9, plan: 'subscription', services: { checkIns: false, guarantee: false, pharmacistCheck: false, vitaminDTest: false }, ratePct })
    expect(v.services.map((s) => s.id)).not.toEqual(expect.arrayContaining(['checkIns']))
    expect(JSON.stringify(v)).not.toMatch(/pharmacist|vitamin D|guarantee/i)
  })
})
