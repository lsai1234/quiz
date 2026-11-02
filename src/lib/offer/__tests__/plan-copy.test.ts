import { aboutMonths, whyPricesDiffer } from '../plan-copy'
import type { PlanComparison } from '@/lib/stack-blueprint/pricing'

const base: PlanComparison = {
  runsOutMonths: 1,
  firstToRunOut: 'Sport Multivitamin',
  lastsMonths: 3,
  longestLasting: 'Omega-3',
  firstDeliveryIdentical: true,
  oneOffPerMonth: 78.16,
  subscriptionPerMonth: 72.21,
  perMonthSaving: 5.95,
  oneOffToday: 87.35,
  subscriptionToday: 72.21,
  firstDeliverySaving: 15.14,
}

describe('why the two prices differ', () => {
  it('says what one of each lasts, what monthly does, and the saving per month', () => {
    const lines = whyPricesDiffer(base, 15)
    expect(lines[0]).toBe('“Just this once” is one pack of each, and packs last different times: your Sport Multivitamin about a month, your Omega-3 about three months.')
    expect(lines[1]).toMatch(/one flat monthly payment .* 15% off\. Packs that last longer than a month are spread/)
    expect(lines.at(-1)).toBe('The same supply bought one-off would cost about £78.16 a month, so keeping stocked saves about £5.95 a month.')
  })

  it('says the monthly box has more in it when it does, and claims no saving that is not there', () => {
    const lines = whyPricesDiffer({ ...base, firstDeliveryIdentical: false, perMonthSaving: 0 }, 13)
    expect(lines).toContain('You get through some of it faster than a pack a month, so your monthly box has more in it than one of each.')
    expect(lines.join(' ')).not.toMatch(/saves/)
  })

  it('leaves out the spread when everything lasts about as long', () => {
    expect(whyPricesDiffer({ ...base, lastsMonths: 1.2 }, 15)[0]).toMatch(/your Sport Multivitamin about a month\.$/)
  })

  it('reads months as people say them', () => {
    expect([1, 1.5, 2, 3].map(aboutMonths)).toEqual(['about a month', 'about six weeks', 'about two months', 'about three months'])
  })
})
