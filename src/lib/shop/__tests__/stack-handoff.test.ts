/**
 * @jest-environment jsdom
 */
import {
  markCameFromStack,
  readStackHandoff,
  clearStackHandoff,
  whatIsLost,
  STACK_RETURN_HREF,
} from '../stack-handoff'

beforeEach(() => sessionStorage.clear())

describe('remembering that a shopper left a stack', () => {
  it('survives a round trip', () => {
    markCameFromStack({ items: 3, discountPct: 0.25 })
    expect(readStackHandoff()).toEqual({ items: 3, discountPct: 0.25 })
  })

  it('is nothing until somebody leaves a stack', () => {
    expect(readStackHandoff()).toBeNull()
  })

  it('is forgotten on request', () => {
    markCameFromStack({ items: 2, discountPct: 0.25 })
    clearStackHandoff()
    expect(readStackHandoff()).toBeNull()
  })

  /*
    Everything here is read back out of storage the browser owns, so all of it
    is somebody else's data by the time it returns. A bar that renders "NaN
    items" or claims a 4000% discount because a value was edited is worse than
    no bar.
  */
  it('refuses a record that has been tampered with', () => {
    sessionStorage.setItem('chrgd.from-stack', 'not json')
    expect(readStackHandoff()).toBeNull()

    sessionStorage.setItem('chrgd.from-stack', JSON.stringify({ items: 0, discountPct: 0.25 }))
    expect(readStackHandoff()).toBeNull()

    sessionStorage.setItem('chrgd.from-stack', JSON.stringify({ items: 'three', discountPct: 0.25 }))
    expect(readStackHandoff()).toBeNull()
  })

  it('clamps a discount that could not be real', () => {
    sessionStorage.setItem('chrgd.from-stack', JSON.stringify({ items: 3, discountPct: 40 }))
    expect(readStackHandoff()?.discountPct).toBe(1)

    sessionStorage.setItem('chrgd.from-stack', JSON.stringify({ items: 3, discountPct: -1 }))
    expect(readStackHandoff()?.discountPct).toBe(0)

    sessionStorage.setItem('chrgd.from-stack', JSON.stringify({ items: 3 }))
    expect(readStackHandoff()?.discountPct).toBe(0)
  })
})

describe('whatIsLost', () => {
  it('names the discount being given up', () => {
    expect(whatIsLost(0.25)).toBe('25% off')
    expect(whatIsLost(0.15)).toBe('15% off')
  })

  /*
    Somebody with no code loses nothing by shopping à la carte, and warning
    them about it invents a loss. They still get the door — just without a
    caveat that would not be true.
  */
  it('says nothing when there is nothing to lose', () => {
    expect(whatIsLost(0)).toBeNull()
    expect(whatIsLost(Number.NaN)).toBeNull()
  })
})

describe('the way back', () => {
  it('points at the hash the reveal reopens on', () => {
    expect(STACK_RETURN_HREF).toBe('/#stack')
  })
})
