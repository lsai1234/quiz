import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RoutineSheet } from '../RoutineSheet'
import { createMockSubscription } from '@/lib/recharge/mock'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'

/**
 * "Your routine": what every rhythm on the plan is worked out from. A change
 * says what moves, before it does, and applies in one confirm.
 */
describe('RoutineSheet', () => {
  const plan = () => createMockSubscription(MOCK_CATALOGUE, 'member@example.com')

  it('says the routine is our estimate until they tell us', () => {
    render(<RoutineSheet subscription={plan()} catalogue={MOCK_CATALOGUE} onConfirm={jest.fn()} onClose={jest.fn()} />)
    expect(screen.getByText(/it’s our estimate: about three training days a week/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update my plan' })).toBeDisabled()
  })

  it('shows which products come more or less often, and the new monthly, before anything changes', async () => {
    const sub = plan()
    const onConfirm = jest.fn()
    render(<RoutineSheet subscription={sub} catalogue={MOCK_CATALOGUE} onConfirm={onConfirm} onClose={jest.fn()} />)
    await userEvent.click(screen.getByRole('radio', { name: '5–6 days' }))
    const preview = document.querySelector<HTMLElement>('[data-routine-preview]')!
    // Training-day products last 30 sessions: about every 5 weeks at five or six days.
    expect(preview).toHaveTextContent(/Pre-Workout: about every 11 weeks → about every 5 weeks/)
    expect(preview).toHaveTextContent(new RegExp(`Your monthly £${sub.flatMonthly.toFixed(2)} →`))
    await userEvent.click(screen.getByRole('button', { name: 'Update my plan' }))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ trainingFrequency: '5-6x', weightBand: null, source: 'member' }))
  })

  it('takes weight as optional, and sizes protein by it', async () => {
    render(<RoutineSheet subscription={plan()} catalogue={MOCK_CATALOGUE} onConfirm={jest.fn()} onClose={jest.fn()} />)
    expect(screen.getByRole('radio', { name: 'Rather not say' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: '90–105kg' }))
    expect(document.querySelector('[data-routine-preview]')).toHaveTextContent(/Whey Protein: every month → 2 at a time, about every 6 weeks/)
  })
})
