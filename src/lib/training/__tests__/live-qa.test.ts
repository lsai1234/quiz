/**
 * @jest-environment node
 */
import { getLiveQa, liveQaIcs, liveQaView, LiveQaError, saveLiveQa } from '../live-qa'

const DAY = 86_400_000

describe('the monthly live Q&A', () => {
  afterAll(async () => saveLiveQa(null))

  it('keeps only https links and a sensible length', async () => {
    await expect(saveLiveQa({ startsAt: '2026-12-01T19:00:00Z', minutes: 60, joinUrl: 'http://zoom.us/j/1' })).rejects.toBeInstanceOf(LiveQaError)
    await expect(saveLiveQa({ startsAt: '2026-12-01T19:00:00Z', minutes: 500 })).rejects.toBeInstanceOf(LiveQaError)
    await expect(saveLiveQa({ startsAt: 'soon', minutes: 60 })).rejects.toBeInstanceOf(LiveQaError)
    const qa = await saveLiveQa({ title: '  December   Q&A ', startsAt: '2026-12-01T19:00:00Z', minutes: 60, joinUrl: 'https://zoom.us/j/1' })
    expect(qa).toMatchObject({ title: 'December Q&A', joinUrl: 'https://zoom.us/j/1', recordingUrl: null })
    expect(await getLiveQa()).toMatchObject({ startsAt: '2026-12-01T19:00:00.000Z' })
  })

  it('shows the join link from the day before until it ends, then the recording for 90 days, then nothing', () => {
    const qa = { title: 'Q&A', startsAt: '2026-12-01T19:00:00.000Z', minutes: 60, joinUrl: 'https://zoom.us/j/1', recordingUrl: 'https://youtu.be/x', updatedAt: '' }
    const start = Date.parse(qa.startsAt)
    expect(liveQaView(qa, new Date(start - 3 * DAY))).toMatchObject({ upcoming: true, joinUrl: null })
    expect(liveQaView(qa, new Date(start - 2 * 3_600_000))).toMatchObject({ upcoming: true, joinUrl: 'https://zoom.us/j/1' })
    expect(liveQaView(qa, new Date(start + 2 * 3_600_000))).toMatchObject({ upcoming: false, joinUrl: null, recording: { url: 'https://youtu.be/x' } })
    expect(liveQaView(qa, new Date(start + 91 * DAY))).toBeNull()
    expect(liveQaView({ ...qa, recordingUrl: null }, new Date(start + 2 * 3_600_000))).toBeNull()
  })

  it('makes a calendar invite that points back to the hub', () => {
    const ics = liveQaIcs({ title: 'Q&A, live', startsAt: '2026-12-01T19:00:00.000Z', minutes: 60, joinUrl: null, recordingUrl: null, updatedAt: '' }, 'https://x.test/myhub/training')
    expect(ics).toContain('DTSTART:20261201T190000Z')
    expect(ics).toContain('DTEND:20261201T200000Z')
    expect(ics).toContain('SUMMARY:Q&A\\, live')
    expect(ics).toContain('https://x.test/myhub/training')
  })
})
