import { coachingOn, DEFAULT_SERVICES, normaliseServices } from '../settings'

describe('the coaching phases', () => {
  it('all three phases are on unless switched off', () => {
    expect(DEFAULT_SERVICES).toMatchObject({ coaching: true, video: true, programmes: true })
    expect(normaliseServices({})).toMatchObject({ coaching: true, video: true, programmes: true })
    expect(normaliseServices({ coaching: false }).coaching).toBe(false)
    expect(normaliseServices({ video: false }).video).toBe(false)
    expect(normaliseServices({ programmes: false }).programmes).toBe(false)
    expect(normaliseServices({ video: true, programmes: true })).toMatchObject({ video: true, programmes: true })
  })

  it('every phase still needs the training plan on', () => {
    expect(coachingOn({ services: { ...DEFAULT_SERVICES, training: false } }, 'coaching')).toBe(false)
    expect(coachingOn({ services: { ...DEFAULT_SERVICES, training: true } }, 'coaching')).toBe(true)
    expect(coachingOn({ services: { ...DEFAULT_SERVICES, training: true } }, 'video')).toBe(true)
    expect(coachingOn({ services: { ...DEFAULT_SERVICES, training: true } }, 'programmes')).toBe(true)
    expect(coachingOn({ services: { ...DEFAULT_SERVICES, training: false } }, 'programmes')).toBe(false)
  })
})
