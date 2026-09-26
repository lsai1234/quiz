/**
 * @jest-environment node
 */
const transcribe = jest.fn()
jest.mock('openai', () => jest.fn().mockImplementation(() => ({ audio: { transcriptions: { create: transcribe } } })))

import { POST } from '../route'
import { VOICE_MODEL } from '@/lib/consult/ai/voice'

const call = (audio: Blob | string | null) => {
  const form = new FormData()
  if (audio !== null) form.append('audio', audio)
  return POST(new Request('http://x/api/consult/voice', { method: 'POST', body: form }))
}
const clip = (type = 'audio/webm;codecs=opus', size = 2000) => new Blob([new Uint8Array(size)], { type })

beforeEach(() => {
  transcribe.mockReset()
  process.env.OPENAI_API_KEY = 'test'
})

describe('/api/consult/voice', () => {
  it('turns a clip into cleaned text, on the pinned model', async () => {
    transcribe.mockResolvedValue({ text: '  I work nights <b>three</b> times a week  ' })
    expect(await (await call(clip())).json()).toEqual({ text: 'I work nights three times a week' })
    const [args] = transcribe.mock.calls[0]
    expect(args.model).toBe(VOICE_MODEL)
    expect(args.file.name).toBe('clip.webm')
  })

  it('withholds a medical transcript rather than returning it', async () => {
    transcribe.mockResolvedValue({ text: 'I take warfarin every morning' })
    const json = await (await call(clip('audio/mp4'))).json()
    expect(json).toEqual({ held: 'medical' })
    expect(JSON.stringify(json)).not.toMatch(/warfarin/)
  })

  it('refuses anything that is not a small audio clip, without calling the model', async () => {
    for (const bad of [clip('video/mp4'), clip('audio/webm', 1_200_000), clip('audio/webm', 0), 'hello', null]) {
      expect(await (await call(bad)).json()).toMatchObject({ fallback: true })
    }
    expect(transcribe).not.toHaveBeenCalled()
  })

  it('falls back to whisper-1 once when the pinned model is refused', async () => {
    transcribe
      .mockRejectedValueOnce(Object.assign(new Error('The model `gpt-4o-mini-transcribe-2025-12-15` does not exist'), { status: 404 }))
      .mockResolvedValueOnce({ text: 'two coffees' })
    expect(await (await call(clip())).json()).toEqual({ text: 'two coffees' })
    expect(transcribe.mock.calls.map(([a]) => a.model)).toEqual([VOICE_MODEL, 'whisper-1'])
  })

  it('does not retry a failure that isn’t about the model', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    transcribe.mockRejectedValueOnce(Object.assign(new Error('Invalid file format'), { status: 400 }))
    expect(await (await call(clip())).json()).toEqual({ fallback: true })
    expect(transcribe).toHaveBeenCalledTimes(1)
    log.mockRestore()
  })

  it('says unavailable without a key', async () => {
    delete process.env.OPENAI_API_KEY
    expect(await (await call(clip())).json()).toEqual({ unavailable: true })
  })

  it('falls back on an error, logging only its name', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    transcribe.mockRejectedValue(new Error('I take warfarin'))
    expect(await (await call(clip())).json()).toEqual({ fallback: true })
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/warfarin/)
    log.mockRestore()
  })
})
