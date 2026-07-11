import { hashPassword, verifyPassword } from '../password'

describe('password hashing', () => {
  it('verifies the right password and rejects the wrong one', () => {
    const stored = hashPassword('correct horse battery staple')
    expect(verifyPassword('correct horse battery staple', stored)).toBe(true)
    expect(verifyPassword('wrong', stored)).toBe(false)
  })

  it('salts every hash', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'))
  })

  it('is robust to missing or malformed stored values', () => {
    expect(verifyPassword('x', null)).toBe(false)
    expect(verifyPassword('x', undefined)).toBe(false)
    expect(verifyPassword('x', 'garbage')).toBe(false)
    expect(verifyPassword('x', 'bcrypt:whatever')).toBe(false)
  })
})
