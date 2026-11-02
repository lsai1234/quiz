import { act, fireEvent, render, screen } from '@testing-library/react'
import { ReadStory } from '../story/ReadStory'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { initialFlow } from '@/lib/consult/flow'
import { prepareResults } from '@/lib/consult/results'
import { offerFitFor } from '@/lib/consult/offer-fit'
import { personFor } from '@/lib/consult/pinpoint/__tests__/simulate'
import { decodeStoryShare } from '@/lib/share-card/story'
import { consultFunnel } from '@/lib/analytics/consult'
import { DEFAULT_OFFER } from '@/lib/offer/settings'
import type { ConsultAnswers } from '@/lib/consult/types'
import type { PatternId } from '@/lib/consult/pinpoint/types'

/** Sharing a card from the read's story (plan Phase 8). */
function story(verdicts: PatternId[]) {
  const answers: ConsultAnswers = {
    ...personFor('everyday', ['wired', 'crash']),
    circuit: { flags: ['heart'], none: false },
    healthConsent: { accepted: true, version: 't', at: 't' },
    pinpoint: { started: true, stopped: false, steps: verdicts.map((pattern) => ({ kind: 'verdict' as const, pattern, verdict: 'yes' as const, stage: 'pinpoint' as const })) },
  }
  const state = { ...initialFlow('c_share000001', 0, answers), phase: 'analysis' as const, sceneId: 'circuit' as const }
  const bundle = prepareResults(state, MOCK_CATALOGUE, new Date('2026-11-02T10:00:00Z'), offerFitFor)
  return render(<ReadStory bundle={bundle} state={state} onDone={jest.fn()} offer={DEFAULT_OFFER} />)
}

const shareButton = () => screen.queryByRole('button', { name: 'Share this card' })
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }))
const card = () => document.querySelector('[data-story]')!.getAttribute('data-story')

beforeEach(() => {
  global.fetch = jest.fn(async () => ({ ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) }) as unknown as Response) as typeof fetch
  URL.createObjectURL = jest.fn(() => 'blob:card')
  URL.revokeObjectURL = jest.fn()
})

it('offers sharing on your day, what I spotted, the dots and Start here; never on Try this week', () => {
  story(['wired'])
  const offered: Record<string, boolean> = {}
  for (let i = 0; i < 6; i++) {
    offered[card()!] = Boolean(shareButton())
    if (card() === 'share') break
    next()
  }
  expect(offered).toMatchObject({ day: true, spotted: true, dots: true, start: true, share: false })
  if ('try' in offered) expect(offered.try).toBe(false)
})

it('won’t share what I spotted when the only pattern found may not be shared', () => {
  story(['broken-nights'])
  next()
  expect(card()).toBe('spotted')
  expect(shareButton()).toBeNull()
})

it('sends only the card’s shape for the image, and saves it where the phone can’t share files', async () => {
  const shared = jest.spyOn(consultFunnel, 'storyShare')
  story(['wired'])
  await act(async () => {
    fireEvent.click(shareButton()!)
  })
  const url = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0])).find((u) => u.startsWith('/api/share/story/image'))!
  expect(url).toMatch(/^\/api\/share\/story\/image\?d=/)
  const sent = decodeStoryShare(new URL(url, 'http://x').searchParams.get('d')!)
  expect(sent).toMatchObject({ v: 1, card: 'day' })
  expect(JSON.stringify(sent)).not.toMatch(/heart|Wired|coffee/)
  // jsdom can't share files: the ladder falls to a download.
  expect(shared).toHaveBeenCalledWith({ card: 'day', method: 'download' })
  shared.mockRestore()
})
