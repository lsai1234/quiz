import React from 'react'
import { render, screen } from '@testing-library/react'
import { RiskBadge } from '../RiskBadge'

describe('RiskBadge', () => {
  it('renders "Low Risk" for risk="low"', () => {
    render(<RiskBadge risk="low" />)
    expect(screen.getByText('Low Risk')).toBeInTheDocument()
  })

  it('renders "Medium Risk" for risk="medium"', () => {
    render(<RiskBadge risk="medium" />)
    expect(screen.getByText('Medium Risk')).toBeInTheDocument()
  })

  it('renders "High Risk" for risk="high"', () => {
    render(<RiskBadge risk="high" />)
    expect(screen.getByText('High Risk')).toBeInTheDocument()
  })

  it('applies smaller padding for default size="sm"', () => {
    const { container } = render(<RiskBadge risk="low" />)
    expect(container.firstChild).toHaveClass('px-2')
  })

  it('applies larger padding for size="md"', () => {
    const { container } = render(<RiskBadge risk="low" size="md" />)
    expect(container.firstChild).toHaveClass('px-3')
  })

  it('applies emerald colour class for low risk', () => {
    const { container } = render(<RiskBadge risk="low" />)
    expect(container.firstChild).toHaveClass('text-emerald-400')
  })

  it('applies amber colour class for medium risk', () => {
    const { container } = render(<RiskBadge risk="medium" />)
    expect(container.firstChild).toHaveClass('text-amber-400')
  })

  it('applies red colour class for high risk', () => {
    const { container } = render(<RiskBadge risk="high" />)
    expect(container.firstChild).toHaveClass('text-red-400')
  })
})
