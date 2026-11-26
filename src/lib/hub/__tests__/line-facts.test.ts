import { countLabel, everyLabel, lastsLabel, rhythmLabel, supplyFit, supplyFitSentence } from '../line-facts'

describe('a product on a plan, in words', () => {
  it('says how often and how many the same way everywhere', () => {
    expect(everyLabel(1)).toBe('every month')
    expect(everyLabel(3)).toBe('every 3 months')
    expect(countLabel(1)).toBeNull()
    expect(rhythmLabel(1, 2)).toBe('every 2 months')
    expect(rhythmLabel(2, 1)).toBe('2 at a time, every month')
  })

  it('says how long one lasts in weeks, and nothing when it doesn’t know', () => {
    expect(lastsLabel(1)).toBe('about 4 weeks')
    expect(lastsLabel(2.5)).toBe('about 11 weeks')
    expect(lastsLabel(undefined)).toBeNull()
    expect(lastsLabel(0)).toBeNull()
  })

  it('tells someone when a rhythm runs out before the next one, or leaves spare', () => {
    // A tub that lasts 2½ months, every 3: about two weeks without.
    expect(supplyFit(2.5, 1, 3)).toEqual({ kind: 'short', days: 15 })
    expect(supplyFitSentence(supplyFit(2.5, 1, 3)!)).toBe('You’d run out about 2 weeks before each one comes.')
    // Every 2: about two weeks over.
    expect(supplyFitSentence(supplyFit(2.5, 1, 2)!)).toBe('You’ll have about 2 weeks spare each time.')
    // Two at a time, every 5 months, would be exact; within three days counts as on time.
    expect(supplyFit(1, 1, 1)).toEqual({ kind: 'on-time', days: 0 })
    expect(supplyFitSentence(supplyFit(3.05, 1, 3)!)).toBe('Each one comes about when you run out.')
    // Short gaps in days.
    expect(supplyFitSentence(supplyFit(3.33, 1, 3)!)).toBe('You’ll have about 10 days spare each time.')
    expect(supplyFit(undefined, 1, 1)).toBeNull()
  })
})
