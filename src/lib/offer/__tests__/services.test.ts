import { coachingOn, DEFAULT_SERVICES, normaliseServices } from '../settings'

describe('the coaching phases', () => {
  it('Phase 1 is on unless switched off; video and programmes stay off until switched on', () => {
    expect(DEFAULT_SERVICES).toMatchObject({ coaching: true, video: false, programmes: false })
    expect(normaliseServices({})).toMatchObject({ coaching: true, video: false, programmes: false })
    expect(normaliseServices({ coaching: false }).coaching).toBe(false)
    expect(normaliseServices({ video: true, programmes: true })).toMatchObject({ video: true, programmes: true })
  })

  it('every phase still needs the training plan on', () => {
    expect(coachingOn({ services: { ...DEFAULT_SERVICES, training: false } }, 'coaching')).toBe(false)
    expect(coachingOn({ services: { ...DEFAULT_SERVICES, training: true } }, 'coaching')).toBe(true)
    expect(coachingOn({ services: { ...DEFAULT_SERVICES, training: true } }, 'video')).toBe(false)
  })
})
