import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnalyticsPage } from '../analytics/AnalyticsPage'
import { buildReport, resolveRange } from '@/lib/analytics/report'
import type { SessionRow } from '@/lib/analytics/sessions'
import type { AnalyticsPayload } from '@/lib/analytics/report-cache'

/**
 * The Analytics page, rendered from a real report. What it pins is the wiring:
 * the figures on screen are the report's, and the controls at the top change
 * the request every figure comes from.
 */

const NOW = Date.now()
const at = new Date(NOW - 3_600_000).toISOString()

let n = 0
function row(over: Partial<SessionRow> = {}): SessionRow {
  n++
  return {
    session_id: `s${n}`, first_seen: at, last_seen: at, events: 1, internal: 0,
    landing_path: '/', source: 'Instagram', channel: 'Social', campaign: null,
    device: 'mobile', os: 'iOS', browser: 'Instagram app', country: 'GB', arm: 'v1', door: null,
    landing_at: at, shop_at: null, quiz_start_at: null, quiz_done_at: null, results_at: null,
    basket_at: null, checkout_at: null, purchase_at: null, purchase_pence: null, subscribed: null,
    quiz_ms: null, abandon_ms: null, last_step: null, steps_seen: null,
    age_bracket: null, gender: null, track: null, primary_goal: null,
    ...over,
  }
}

function payload(): AnalyticsPayload {
  const rows = [
    row(),
    row({ device: 'desktop', quiz_start_at: at, door: 'quiz', last_step: 'personal', abandon_ms: 30_000 }),
    row({ quiz_start_at: at, quiz_done_at: at, results_at: at, checkout_at: at, purchase_at: at, purchase_pence: 4799, quiz_ms: 130_000, age_bracket: '25-34', gender: 'female' }),
  ]
  return {
    asOf: new Date(NOW).toISOString(),
    report: buildReport({ rows, previousRows: [row()], range: resolveRange('30d', NOW, null), labelForStep: () => 'A little about you.', contextSince: at }),
    ladders: [{ arm: 'v1', label: 'Original quiz', started: 2, completed: 1, steps: [] }],
    ladderSampled: false,
    importing: false,
  }
}

const fetchMock = jest.fn()

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve(payload()) }))
  global.fetch = fetchMock as unknown as typeof fetch
  window.history.replaceState(null, '', '/founderhub/analytics')
})

const lastUrl = () => String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0])

describe('AnalyticsPage', () => {
  it('shows the report’s figures', async () => {
    render(<AnalyticsPage />)
    await screen.findByText('Where people fall off')
    const kpis = screen.getByRole('region', { name: 'Headline figures' })
    expect(within(kpis).getByText('Visits').parentElement).toHaveTextContent('3')
    expect(within(kpis).getByText('Bought').parentElement).toHaveTextContent('50% of starters · £47.99')
    expect(within(kpis).getByText('Time to finish').parentElement).toHaveTextContent('2m 10s')
    expect(screen.getByText(/The biggest drop is between/)).toBeInTheDocument()
    expect(screen.getByText('Where the people who left were last seen')).toBeInTheDocument()
  })

  it('asks for the period and the filters every figure is scoped by, and keeps them in the URL', async () => {
    const user = userEvent.setup()
    render(<AnalyticsPage />)
    await screen.findByText('Where people fall off')
    expect(lastUrl()).toBe('/api/portal/analytics?range=30d')

    await user.click(screen.getByRole('radio', { name: '7 days' }))
    await waitFor(() => expect(lastUrl()).toBe('/api/portal/analytics?range=7d'))

    await user.selectOptions(screen.getByRole('combobox', { name: 'Show only' }), 'device:mobile')
    await waitFor(() => expect(lastUrl()).toBe('/api/portal/analytics?range=7d&f=device%3Amobile'))
    expect(window.location.search).toBe('?range=7d&f=device%3Amobile')

    await user.click(screen.getByRole('checkbox', { name: /Include our own visits/ }))
    await waitFor(() => expect(lastUrl()).toContain('internal=1'))
  })

  it('narrows the page to a segment from a breakdown row', async () => {
    const user = userEvent.setup()
    render(<AnalyticsPage />)
    await screen.findByText('Where people fall off')
    await user.click(screen.getByRole('tab', { name: 'Devices' }))
    await user.click(screen.getByRole('button', { name: 'Show only device: Computer' }))
    await waitFor(() => expect(lastUrl()).toContain('f=device%3Adesktop'))
  })

  it('says so, rather than showing zeros, when a request fails', async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }))
    await act(async () => {
      render(<AnalyticsPage />)
    })
    expect(await screen.findByText(/Could not load the analytics/)).toBeInTheDocument()
  })
})
