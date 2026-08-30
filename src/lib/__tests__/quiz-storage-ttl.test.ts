/**
 * The quiz's persisted state expires.
 *
 * What sits under `chrgd-quiz` is the full answer set, and once the safety
 * screen has been answered that includes whether someone is pregnant, on
 * prescription medication or allergic to shellfish. On a shared laptop, keeping
 * that indefinitely is somebody else's health information left in a browser long
 * after the quiz it belonged to was abandoned.
 */
import { QUIZ_STATE_TTL_MS, useQuizStore } from '@/lib/store'

const KEY = 'chrgd-quiz'

function write(savedAt: number | undefined) {
  window.localStorage.setItem(
    KEY,
    JSON.stringify({
      version: 1,
      state: {
        answers: { name: 'Sam', safetyFlags: ['pregnancy'] },
        step: 3,
        interview: null,
        ...(savedAt === undefined ? {} : { savedAt }),
      },
    }),
  )
}

/** Rehydrate the way the app does — the store uses `skipHydration`. */
async function rehydrate() {
  await useQuizStore.persist.rehydrate()
}

beforeEach(() => {
  window.localStorage.clear()
  useQuizStore.getState().reset()
})

describe('persisted quiz state', () => {
  it('resumes a quiz saved within the window', async () => {
    write(Date.now() - 60 * 60 * 1000)
    await rehydrate()
    expect(useQuizStore.getState().answers.name).toBe('Sam')
    expect(useQuizStore.getState().step).toBe(3)
  })

  it('does not resume one past the window', async () => {
    write(Date.now() - QUIZ_STATE_TTL_MS - 1000)
    await rehydrate()
    expect(useQuizStore.getState().answers.name).not.toBe('Sam')
    expect(useQuizStore.getState().answers.safetyFlags ?? []).toEqual([])
  })

  it('removes the expired key rather than leaving it on disk', async () => {
    // Declining to READ it is not enough — the health answers are still sitting
    // in the browser for anyone who opens devtools.
    write(Date.now() - QUIZ_STATE_TTL_MS - 1000)
    await rehydrate()
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('discards state written before the stamp existed', async () => {
    // Anything already on a visitor's machine has no `savedAt` and no way to
    // date it, so it is treated as expired rather than kept forever.
    write(undefined)
    await rehydrate()
    expect(useQuizStore.getState().answers.name).not.toBe('Sam')
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('stamps a fresh save so it can be dated later', async () => {
    useQuizStore.getState().setAnswer('name', 'Alex')
    const raw = window.localStorage.getItem(KEY)
    expect(raw).not.toBeNull()
    expect(typeof JSON.parse(raw!).state.savedAt).toBe('number')
  })

  it('survives storage that throws, without breaking the quiz', async () => {
    // Safari in private mode throws rather than returning null. A quiz that
    // cannot START is far worse than one that cannot resume.
    const original = window.localStorage.getItem
    window.localStorage.getItem = () => { throw new Error('denied') }
    await expect(rehydrate()).resolves.not.toThrow()
    window.localStorage.getItem = original
  })
})
