import { act, fireEvent, render, screen } from '@testing-library/react'
import { SCENES } from '@/lib/consult/flow'
import { HELD_BACK } from '@/lib/consult/ai/guard'
import { EMPTY_ANSWERS, type ConsultAnswers } from '@/lib/consult/types'
import { AmpConsult } from '../AmpConsult'
import { BLOCKED, HoldToTalk } from '../HoldToTalk'
import { TellAmpMore } from '../TellAmpMore'
import { READ_ALOUD_KEY, toSpeech } from '../useReadAloud'
import { hintFor, initialFlow, type FlowState } from '@/lib/consult/flow'

/* ── A fake microphone ─────────────────────────────────────────────────── */

const tracks: { stop: jest.Mock }[] = []
function fakeMic(allow = true) {
  const getUserMedia = jest.fn(async () => {
    if (!allow) throw new DOMException('denied', 'NotAllowedError')
    const track = { stop: jest.fn() }
    tracks.push(track)
    return { getTracks: () => [track] } as unknown as MediaStream
  })
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
  return getUserMedia
}

class FakeRecorder {
  static isTypeSupported = (t: string) => t === 'audio/webm;codecs=opus'
  state = 'inactive'
  mimeType = 'audio/webm;codecs=opus'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['sound'], { type: this.mimeType }) })
    this.onstop?.()
  }
}

beforeEach(() => {
  tracks.length = 0
  ;(global as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder
  jest.spyOn(Date, 'now').mockReturnValue(0)
})
afterEach(() => jest.restoreAllMocks())

const mic = () => screen.getByRole('button', { name: /Hold to talk|Listening/ })
async function hold(ms: number, via: 'pointer' | 'keyboard' = 'pointer') {
  await act(async () => {
    if (via === 'pointer') fireEvent.pointerDown(mic(), { pointerId: 1 })
    else fireEvent.keyDown(mic(), { key: ' ' })
  })
  ;(Date.now as jest.Mock).mockReturnValue(ms)
  await act(async () => {
    if (via === 'pointer') fireEvent.pointerUp(mic(), { pointerId: 1 })
    else fireEvent.keyUp(mic(), { key: ' ' })
  })
}

describe('U3 hold to talk', () => {
  function setup(send: jest.Mock = jest.fn(async (): Promise<{ text?: string; held?: string }> => ({ text: 'three coffees a day' }))) {
    fakeMic()
    const props = { onText: jest.fn(), onBlocked: jest.fn(), onMessage: jest.fn(), onBusy: jest.fn(), send }
    render(<HoldToTalk {...props} />)
    return props
  }

  it('records while held, shows a waveform, and hands back the text', async () => {
    const props = setup()
    await act(async () => {
      fireEvent.pointerDown(mic(), { pointerId: 1 })
    })
    expect(mic()).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('[data-waveform]')).not.toBeNull()
    ;(Date.now as jest.Mock).mockReturnValue(1500)
    await act(async () => {
      fireEvent.pointerUp(mic(), { pointerId: 1 })
    })
    expect(props.send).toHaveBeenCalledWith(expect.any(Blob))
    expect(props.onText).toHaveBeenCalledWith('three coffees a day')
  })

  it('closes the mic as soon as the button is let go', async () => {
    setup()
    await hold(1500)
    expect(tracks).toHaveLength(1)
    expect(tracks[0].stop).toHaveBeenCalled()
  })

  it('works from the keyboard: hold Space', async () => {
    const props = setup()
    await hold(1200, 'keyboard')
    expect(props.onText).toHaveBeenCalledWith('three coffees a day')
  })

  it('treats a quick tap as a tap, sending nothing', async () => {
    const props = setup()
    await hold(100)
    expect(props.send).not.toHaveBeenCalled()
    expect(props.onMessage).toHaveBeenLastCalledWith('Hold the button down while you talk, then let go.')
  })

  it('passes on a withheld medical transcript as the usual message', async () => {
    const props = setup(jest.fn(async () => ({ held: 'medical' })))
    await hold(1500)
    expect(props.onText).not.toHaveBeenCalled()
    expect(props.onMessage).toHaveBeenLastCalledWith(HELD_BACK.medical)
  })
})

describe('U3 voice in "Tell Amp more"', () => {
  const scene = SCENES.find((s) => s.id === 'caffeine')!

  it('drops what was said into the box, to check before sending', async () => {
    fakeMic()
    const send = jest.fn()
    render(<TellAmpMore scene={scene} onAdd={jest.fn()} onClose={jest.fn()} onThinking={jest.fn()} send={send} voice transcribe={async () => ({ text: 'three coffees a day' })} />)
    await hold(1500)
    expect(screen.getByRole('textbox')).toHaveValue('three coffees a day')
    expect(send).not.toHaveBeenCalled()
  })

  it('falls back to typing when the mic is blocked', async () => {
    fakeMic(false)
    render(<TellAmpMore scene={scene} onAdd={jest.fn()} onClose={jest.fn()} onThinking={jest.fn()} voice />)
    await act(async () => {
      fireEvent.pointerDown(mic(), { pointerId: 1 })
    })
    expect(screen.getByText(BLOCKED)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Hold to talk/ })).toBeNull()
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  it('isn’t offered where the browser can’t record', () => {
    delete (global as unknown as { MediaRecorder?: unknown }).MediaRecorder
    render(<TellAmpMore scene={scene} onAdd={jest.fn()} onClose={jest.fn()} onThinking={jest.fn()} />)
    expect(screen.queryByRole('button', { name: /Hold to talk/ })).toBeNull()
  })
})

/* ── U4 read aloud ─────────────────────────────────────────────────────── */

describe('U4 read aloud', () => {
  let spoken: string[]
  let cancel: jest.Mock
  beforeEach(() => {
    spoken = []
    cancel = jest.fn()
    sessionStorage.clear()
    localStorage.clear()
    ;(global as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
      lang = ''
      rate = 1
      voice: unknown = null
      constructor(public text: string) {}
    }
    Object.defineProperty(window, 'speechSynthesis', {
      value: { speak: (u: { text: string }) => spoken.push(u.text), cancel, getVoices: () => [] },
      configurable: true,
    })
  })

  const at = (sceneId: FlowState['sceneId'], answers: Partial<ConsultAnswers>): FlowState => ({
    ...initialFlow('c1', 0, { route: 'deep' }),
    sceneId,
    answers: { ...EMPTY_ANSWERS, route: 'deep', goals: ['energy'], ...answers },
  })

  it('reads the question and hint aloud in comfort mode', () => {
    render(<AmpConsult initial={at('energy', { comfort: true, comfortOffered: true })} />)
    const scene = SCENES.find((s) => s.id === 'energy')!
    expect(spoken).toEqual([toSpeech(scene.copy.question, hintFor(scene.copy, true))])
    expect(spoken[0]).toMatch(/minus and plus/)
    expect(spoken[0]).not.toMatch(/[?!.]\./)
    expect(screen.getByRole('button', { name: 'Reading aloud' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('joins question and hint without doubling punctuation', () => {
    expect(toSpeech('What are you after?', 'Pick up to three')).toBe('What are you after? Pick up to three.')
    expect(toSpeech('Set your sleep window', undefined)).toBe('Set your sleep window.')
  })

  it('stays quiet, with no toggle, at the standard size', () => {
    render(<AmpConsult initial={at('energy', { comfort: false, comfortOffered: true })} />)
    expect(spoken).toEqual([])
    expect(screen.queryByRole('button', { name: /Read(ing)? aloud/ })).toBeNull()
  })

  it('turns off with one tap, and stays off for the session', () => {
    const { unmount } = render(<AmpConsult initial={at('energy', { comfort: true, comfortOffered: true })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reading aloud' }))
    expect(cancel).toHaveBeenCalled()
    expect(sessionStorage.getItem(READ_ALOUD_KEY)).toBe('off')
    unmount()
    spoken = []
    render(<AmpConsult initial={at('sleep', { comfort: true, comfortOffered: true })} />)
    expect(spoken).toEqual([])
    expect(screen.getByRole('button', { name: 'Read aloud' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('stops talking when the scene changes', () => {
    render(<AmpConsult initial={at('energy', { comfort: true, comfortOffered: true, energy: 5 })} />)
    fireEvent.click(screen.getByRole('button', { name: /^(Next|Looks right|Continue)$/ }))
    expect(cancel).toHaveBeenCalled()
    expect(spoken).toHaveLength(2)
  })
})
