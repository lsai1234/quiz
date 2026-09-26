import { KINDS } from '../knowledge'
import { CLAIMS, CLAIMS_BY_KIND, claimsFor } from '../claims'

describe('D1 register claims', () => {
  it('maps kinds only to claims that exist', () => {
    for (const ids of Object.values(CLAIMS_BY_KIND)) for (const id of ids!) expect(CLAIMS[id]).toBeDefined()
  })

  it('keys every claim by its own id, with wording and a condition of use', () => {
    for (const [key, c] of Object.entries(CLAIMS)) {
      expect(c.id).toBe(key)
      expect(c.wording.length).toBeGreaterThan(20)
      expect(c.condition.length).toBeGreaterThan(0)
    }
  })

  it('gives kinds with no authorised claim none at all', () => {
    for (const kind of ['adaptogen', 'collagen', 'joint-support', 'probiotic', 'greens', 'nootropic', 'pre-workout-stim', 'fat-burner'] as const) {
      expect(claimsFor(kind)).toEqual([])
    }
  })

  it('never uses words the register doesn’t: no "boost", "detox", "cure" or "prevent"', () => {
    for (const c of Object.values(CLAIMS)) expect(c.wording).not.toMatch(/boost|detox|cure|prevent|treat/i)
  })

  it('only names real kinds', () => {
    for (const kind of Object.keys(CLAIMS_BY_KIND)) expect(Object.keys(KINDS)).toContain(kind)
  })
})
