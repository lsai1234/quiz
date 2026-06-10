import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Chip } from '../Chip'

describe('Chip', () => {
  it('renders the label text', () => {
    render(<Chip label="Gym myth" />)
    expect(screen.getByText('Gym myth')).toBeInTheDocument()
  })

  it('renders emoji when provided', () => {
    render(<Chip label="Hot take" emoji="🔥" />)
    expect(screen.getByText('🔥')).toBeInTheDocument()
  })

  it('does not render an emoji span when emoji is omitted', () => {
    render(<Chip label="No emoji" />)
    expect(screen.queryByText(/[^\w\s]/)).toBeNull()
  })

  it('calls onClick when clicked', async () => {
    const handler = jest.fn()
    render(<Chip label="Click me" onClick={handler} />)
    await userEvent.click(screen.getByRole('button'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('applies selected background when selected=true', () => {
    render(<Chip label="Selected" selected />)
    expect(screen.getByRole('button')).toHaveClass('bg-orange-500')
  })

  it('applies unselected background when selected=false', () => {
    render(<Chip label="Unselected" selected={false} />)
    expect(screen.getByRole('button')).toHaveClass('bg-zinc-800')
  })

  it('renders as a button element', () => {
    render(<Chip label="Test" />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('applies goal variant classes when variant="goal"', () => {
    render(<Chip label="Saves" variant="goal" />)
    expect(screen.getByRole('button')).toHaveClass('bg-zinc-900')
  })

  it('applies action variant classes when variant="action"', () => {
    render(<Chip label="Improve" variant="action" />)
    expect(screen.getByRole('button')).toHaveClass('bg-zinc-800')
  })
})
