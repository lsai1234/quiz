import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChangePolicyChoice } from '../ChangePolicyChoice'

describe('ChangePolicyChoice', () => {
  it('offers exactly two options — nothing that waits on the member', () => {
    render(<ChangePolicyChoice policy="auto-swap" onChange={jest.fn()} monthly={60.05} />)

    const options = screen.getAllByRole('radio')
    expect(options).toHaveLength(2)
    expect(screen.getByRole('radio', { name: /keep my plan whole/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /take it off my plan/i })).toBeInTheDocument()
    expect(screen.queryByText(/ask me/i)).not.toBeInTheDocument()
  })

  it('states the consequence of each option in real money', () => {
    render(<ChangePolicyChoice policy="auto-swap" onChange={jest.fn()} monthly={60.05} removesMonthly={12.75} />)

    expect(screen.getByText(/your £60\.05\/mo doesn’t change/i)).toBeInTheDocument()
    expect(screen.getByText(/drops by £12\.75 to £47\.30 from your next payment/i)).toBeInTheDocument()
  })

  it('stays honest plan-wide, where the figure depends on which product it turns out to be', () => {
    render(<ChangePolicyChoice policy="remove" onChange={jest.fn()} monthly={60.05} />)
    expect(screen.getByText(/drops by whatever that item was costing/i)).toBeInTheDocument()
  })

  it('marks the current choice for assistive tech', () => {
    render(<ChangePolicyChoice policy="remove" onChange={jest.fn()} monthly={60.05} />)

    expect(screen.getByRole('radio', { name: /take it off my plan/i })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /keep my plan whole/i })).toHaveAttribute('aria-checked', 'false')
  })

  it('reports a change', async () => {
    const onChange = jest.fn()
    const user = userEvent.setup()
    render(<ChangePolicyChoice policy="auto-swap" onChange={onChange} monthly={60.05} />)

    await user.click(screen.getByRole('radio', { name: /take it off my plan/i }))
    expect(onChange).toHaveBeenCalledWith('remove')
  })

  it('promises the email and the hub, so a no-action default is fair', () => {
    render(<ChangePolicyChoice policy="auto-swap" onChange={jest.fn()} monthly={60.05} />)
    // getByText normalises whitespace, so this matches across the wrapped lines.
    expect(screen.getByText(/we’ll email you.*change it yourself in your hub/i)).toBeInTheDocument()
  })

  it('tells a member with exclusions what a swap will and won’t do', () => {
    render(
      <ChangePolicyChoice policy="auto-swap" onChange={jest.fn()} monthly={60.05} constraintsLabel="vegan and stimulant-free" />,
    )

    expect(screen.getByText(/only ever swap to another one/i)).toBeInTheDocument()
    expect(screen.getByText(/vegan and stimulant-free/i)).toBeInTheDocument()
    expect(screen.getByText(/take it off and lower your bill/i)).toBeInTheDocument()
  })

  it('drops the safety note when removal is chosen — there is no swap to qualify', () => {
    render(<ChangePolicyChoice policy="remove" onChange={jest.fn()} monthly={60.05} constraintsLabel="vegan" />)
    expect(screen.queryByText(/only ever swap to another one/i)).not.toBeInTheDocument()
  })
})
