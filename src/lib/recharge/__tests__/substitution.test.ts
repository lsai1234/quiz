import { createMockSubscription, setLineSubstitution } from '@/lib/recharge/mock'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'

describe('substitution consent on subscription lines', () => {
  it('defaults every line to allow substitution', () => {
    const sub = createMockSubscription(MOCK_CATALOGUE, 'a@b.com')
    expect(sub.lines.length).toBeGreaterThan(0)
    expect(sub.lines.every((l) => l.allowSubstitution === true)).toBe(true)
  })

  it('setLineSubstitution flips a single line, leaving others and pricing untouched', () => {
    const sub = createMockSubscription(MOCK_CATALOGUE, 'a@b.com')
    const target = sub.lines[0]
    const next = setLineSubstitution(sub, target.id, false)
    expect(next.lines.find((l) => l.id === target.id)?.allowSubstitution).toBe(false)
    expect(next.lines.filter((l) => l.id !== target.id).every((l) => l.allowSubstitution === true)).toBe(true)
    expect(next.flatMonthly).toBe(sub.flatMonthly)
  })
})
