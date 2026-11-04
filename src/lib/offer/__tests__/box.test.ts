import { BOX_START_MAX, boxOn, levelForCount, nextLevel, startingBox } from '../box'

describe('your box: a selection, not three sizes', () => {
  it('starts with products in order while the box stays under the ceiling, never empty', () => {
    const items = [
      { id: 'a', price: 20 },
      { id: 'b', price: 35 },
      { id: 'c', price: 15 },
      { id: 'd', price: 14 },
    ]
    // 20, then 35 would make 55 (over 50): skipped; 15 makes 35; 14 makes 49.
    expect(startingBox(items)).toEqual(['a', 'c', 'd'])
    expect(BOX_START_MAX).toBe(50)
  })

  it('never opens at £100: one expensive product is a box of one', () => {
    expect(startingBox([{ id: 'big', price: 62 }, { id: 'next', price: 38 }])).toEqual(['big'])
  })

  it('sets the monthly rate by how many products are on', () => {
    expect([1, 3, 4, 5, 6, 8].map(levelForCount)).toEqual(['essentials', 'essentials', 'performance', 'performance', 'complete', 'complete'])
    expect(nextLevel(3)).toEqual({ level: 'performance', more: 1 })
    expect(nextLevel(5)).toEqual({ level: 'complete', more: 1 })
    expect(nextLevel(6)).toBeNull()
  })

  it('keeps their own choices over the starting box, and drops what is no longer listed', () => {
    const listed = ['a', 'b', 'c', 'd']
    expect(boxOn(listed, ['a', 'c'], { on: [], off: [] })).toEqual(['a', 'c'])
    expect(boxOn(listed, ['a', 'c'], { on: ['b'], off: ['a'] })).toEqual(['b', 'c'])
    expect(boxOn(['a', 'b'], ['a', 'c'], { on: ['gone'], off: [] })).toEqual(['a'])
  })
})
