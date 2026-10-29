/**
 * @jest-environment jsdom
 */
/** UI sounds (plan Phase 7.6): off by default, and nothing more loaded until they're on. */
describe('UI sounds', () => {
  beforeEach(() => {
    jest.resetModules()
    localStorage.clear()
  })

  it('are off by default, and stay on once switched on', async () => {
    const s = await import('../sound-switch')
    expect(s.soundsOn()).toBe(false)
    s.setSounds(true)
    expect(localStorage.getItem('amp-sounds')).toBe('1')
    jest.resetModules()
    expect((await import('../sound-switch')).soundsOn()).toBe(true)
  })

  it('never fetch the synth while off', async () => {
    const play = jest.fn()
    jest.doMock('../sound', () => ({ play }))
    const s = await import('../sound-switch')
    s.cue('tick')
    await new Promise((r) => setTimeout(r, 0))
    expect(play).not.toHaveBeenCalled()
    s.setSounds(true)
    s.cue('drop')
    await new Promise((r) => setTimeout(r, 0))
    expect(play).toHaveBeenCalledWith('drop')
  })
})
