import { rememberScroll, readScroll, forgetScroll } from '../scroll-memory'

describe('scroll memory', () => {
  beforeEach(() => sessionStorage.clear())

  it('remembers a position and reads it back', () => {
    rememberScroll(1240.6)
    expect(readScroll()).toBe(1241)
  })

  it('has nothing to say before anything is remembered', () => {
    expect(readScroll()).toBeNull()
  })

  it('forgets on request', () => {
    rememberScroll(400)
    forgetScroll()
    expect(readScroll()).toBeNull()
  })

  it('ignores a value that is not a position', () => {
    sessionStorage.setItem('chrgd:shop-scroll', 'halfway')
    expect(readScroll()).toBeNull()
    sessionStorage.setItem('chrgd:shop-scroll', '-20')
    expect(readScroll()).toBeNull()
  })

  it('survives storage being unavailable', () => {
    // A private window, or a browser set to block site data. Losing the
    // position is acceptable; throwing on a shelf render is not.
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage')
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() { throw new Error('blocked') },
    })
    expect(() => rememberScroll(10)).not.toThrow()
    expect(readScroll()).toBeNull()
    expect(() => forgetScroll()).not.toThrow()
    if (original) Object.defineProperty(window, 'sessionStorage', original)
  })
})
