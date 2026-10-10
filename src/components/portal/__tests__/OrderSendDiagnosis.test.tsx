import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderSendDiagnosis } from '../OrderSendDiagnosis'

function reply(body: unknown, { ok = true, status = 200 } = {}) {
  return Promise.resolve({ ok, status, json: async () => body } as Response)
}

const DIAGNOSIS = {
  ranAt: '2026-10-10T11:40:00.000Z',
  headline: { status: 'fail', sentence: 'PowerBody said: “Customer phone number is invalid”.' },
  checks: [
    { id: 'last-answer', title: 'What PowerBody said last time', status: 'fail', detail: 'PowerBody refused it and said why.' },
    { id: 'item-P47499', title: 'P47499 · Omega 3', status: 'pass', detail: 'In stock — 25 available, 1 needed.' },
  ],
  lastAttempt: {
    at: '2026-10-10T11:31:00.000Z',
    ok: false,
    outcome: 'rejected',
    code: 'FAIL',
    reason: 'Customer phone number is invalid',
    reply: '{"api_response":"FAIL","message":"Customer phone number is invalid"}',
    request: { id: 'ord_1' },
    error: 'PowerBody rejected order ord_1: FAIL',
  },
  lastAttemptFromTimeline: false,
  payload: { id: 'ord_1', products: [] },
}

const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
})

describe('OrderSendDiagnosis', () => {
  it('asks for a diagnosis and shows the headline, the checks and the raw material', async () => {
    const fetchMock = jest.fn(() => reply({ ok: true, diagnosis: DIAGNOSIS }))
    global.fetch = fetchMock as unknown as typeof fetch

    render(<OrderSendDiagnosis orderId="ord_1" />)
    await userEvent.click(screen.getByRole('button', { name: /find out why/i }))

    expect(await screen.findByText(/Customer phone number is invalid”\./)).toBeInTheDocument()
    expect(screen.getByText('P47499 · Omega 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /what powerbody replied/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /what we sent last time/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /what we would send now/i })).toBeInTheDocument()

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/portal/orders/ord_1')
    expect(JSON.parse(String(init.body))).toEqual({ action: 'diagnose' })
  })

  it('says when the checks could not be run', async () => {
    global.fetch = jest.fn(() => reply({ error: 'Order not found' }, { ok: false, status: 404 })) as unknown as typeof fetch

    render(<OrderSendDiagnosis orderId="ord_missing" />)
    await userEvent.click(screen.getByRole('button', { name: /find out why/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Order not found')
  })
})
