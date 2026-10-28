import { act, fireEvent, render, screen } from '@testing-library/react'
import { SpeedPanel } from '../SpeedPanel'
import { AREAS, vitalsReport } from '@/lib/analytics/vitals'
import type { StoredEvent } from '@/lib/analytics/repo'

/** The hub's speed panel (plan Phase 7.1): real-device figures by device type. */
const ev = (event: string, props: Record<string, unknown>, path: string) => ({ id: path + Math.random(), sessionId: 's', event, props, path, createdAt: '' }) as unknown as StoredEvent
const EVENTS = [
  ev('web_vital', { metric: 'LCP', value: 4600, device: 'mobile' }, '/quizv2'),
  ev('web_vital', { metric: 'INP', value: 120, device: 'mobile' }, '/quizv2'),
  ev('web_vital', { metric: 'LCP', value: 1400, device: 'desktop' }, '/shop'),
  ev('long_frames', { count: 2, worstMs: 180, blockingMs: 70, device: 'mobile' }, '/quizv2'),
]
const payload = (founders: boolean) => ({ windowDays: 28, founders, areas: Object.fromEntries(AREAS.map((a) => [a, vitalsReport(founders ? EVENTS : EVENTS.slice(2, 3), a)])) })

beforeEach(() => {
  global.fetch = jest.fn(async (url: RequestInfo | URL) => ({ ok: true, json: async () => payload(String(url).includes('founders=1')) })) as unknown as typeof fetch
})

it('shows p75 by device with a rating, and the long frames beside it', async () => {
  await act(async () => void render(<SpeedPanel />))
  await act(async () => void fireEvent.click(screen.getByRole('checkbox', { name: /Include founder sessions/ })))
  const phone = document.querySelector('[data-device="mobile"]')!
  expect(phone).toHaveTextContent('4.6s')
  expect(phone).toHaveTextContent('Poor')
  expect(phone).toHaveTextContent('120ms')
  expect(screen.getByText('180ms')).toBeInTheDocument()
  expect(global.fetch).toHaveBeenLastCalledWith('/api/portal/vitals?founders=1')
})

it('reads one part of the site at a time, and leaves founders out by default', async () => {
  await act(async () => void render(<SpeedPanel />))
  expect(global.fetch).toHaveBeenCalledWith('/api/portal/vitals')
  expect(document.querySelector('[data-device="desktop"]')).toHaveTextContent('1.4s')
  fireEvent.click(screen.getByRole('radio', { name: 'Consult' }))
  expect(screen.getByText(/No measurements here yet/)).toBeInTheDocument()
})
