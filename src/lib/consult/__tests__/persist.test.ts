import { applyPlaceholder, flowReducer, initialFlow, SCENES, SCRIPT_VERSION, type FlowState } from '../flow'
import {
  CONSULT_STORAGE_KEY,
  CONSULT_TTL_MS,
  clearConsult,
  forStorage,
  hasActiveConsultSession,
  isResumable,
  isSameSession,
  loadConsult,
  saveConsult,
} from '../persist'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

function advancedTo(sceneId: string): FlowState {
  let s = initialFlow('c_abc', 0, { route: 'deep' })
  for (let guard = 0; guard < 20 && s.sceneId !== sceneId && s.phase === 'scenes'; guard++) {
    const def = SCENES.find((d) => d.id === s.sceneId)!
    if (def.placeholder) s = flowReducer(s, { type: 'answer', patch: applyPlaceholder(def.placeholder.options[0], s.answers) })
    s = flowReducer(s, { type: 'next' })
  }
  return s
}

describe('saving the consult', () => {
  it('round-trips the state under its consult ID', () => {
    const state = advancedTo('sleep')
    saveConsult(state, 1000)
    const loaded = loadConsult(2000)
    expect(loaded?.consultId).toBe('c_abc')
    expect(loaded?.sceneId).toBe('sleep')
    expect(loaded?.answers).toEqual(state.answers)
  })

  it('never writes the circuit check answers to the device', () => {
    const state = flowReducer(advancedTo('circuit'), {
      type: 'answer',
      patch: { circuit: { flags: ['blood-thinners'], none: false } },
    })
    saveConsult(state)
    expect(localStorage.getItem(CONSULT_STORAGE_KEY)).not.toMatch(/blood-thinners/)
    expect(loadConsult()?.answers.circuit).toBeNull()
  })

  it('resumes a finished consult on the circuit check, which is asked again', () => {
    let s = advancedTo('circuit')
    s = flowReducer(s, { type: 'answer', patch: { circuit: { flags: [], none: true } } })
    s = flowReducer(s, { type: 'next' })
    expect(s.phase).toBe('analysis')
    const stored = forStorage(s)
    expect(stored.phase).toBe('scenes')
    expect(stored.sceneId).toBe('circuit')
  })

  it('drops a save older than a week', () => {
    saveConsult(advancedTo('energy'), 0)
    expect(loadConsult(CONSULT_TTL_MS + 1)).toBeNull()
    expect(localStorage.getItem(CONSULT_STORAGE_KEY)).toBeNull()
  })

  it('drops a save from a different version of the script', () => {
    const state = { ...advancedTo('energy'), scriptVersion: SCRIPT_VERSION + 1 }
    saveConsult(state)
    expect(loadConsult()).toBeNull()
  })

  it('shrugs off corrupt storage', () => {
    localStorage.setItem(CONSULT_STORAGE_KEY, '{nope')
    expect(loadConsult()).toBeNull()
  })

  it('survives storage that throws', () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })
    expect(() => saveConsult(advancedTo('energy'))).not.toThrow()
    spy.mockRestore()
  })
})

describe('knowing whether to resume', () => {
  it('tells a refresh in the same tab from a return visit', () => {
    saveConsult(advancedTo('energy'))
    expect(isSameSession('c_abc')).toBe(true)
    expect(hasActiveConsultSession()).toBe(true)
    sessionStorage.clear()
    expect(isSameSession('c_abc')).toBe(false)
    expect(hasActiveConsultSession()).toBe(false)
  })

  it('only offers to resume once they have got past the first scene', () => {
    expect(isResumable(initialFlow('c', 0))).toBe(false)
    expect(isResumable(advancedTo('about'))).toBe(true)
    expect(isResumable(null)).toBe(false)
  })

  it('forgets everything on clear', () => {
    saveConsult(advancedTo('energy'))
    clearConsult()
    expect(loadConsult()).toBeNull()
    expect(hasActiveConsultSession()).toBe(false)
  })
})
