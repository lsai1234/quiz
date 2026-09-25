import { fireEvent, render, screen } from '@testing-library/react'
import { Chip, NextButton, Segmented, Tile } from '../controls'

describe('Tile', () => {
  it('reports its state as a toggle', () => {
    const onSelect = jest.fn()
    render(<Tile label="Energy" selected={false} onSelect={onSelect} />)
    const tile = screen.getByRole('button', { name: 'Energy' })
    expect(tile).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(tile)
    expect(onSelect).toHaveBeenCalled()
  })

  it('is a radio inside a single-choice group', () => {
    render(<Tile label="25–34" kind="radio" selected onSelect={() => undefined} />)
    expect(screen.getByRole('radio', { name: '25–34' })).toHaveAttribute('aria-checked', 'true')
  })

  it('shows a badge, such as a priority number', () => {
    render(<Tile label="Focus" selected onSelect={() => undefined} badge={2} />)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('does nothing when disabled', () => {
    const onSelect = jest.fn()
    render(<Tile label="Focus" selected={false} disabled onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('Chip', () => {
  it('toggles', () => {
    const onToggle = jest.fn()
    render(<Chip label="Creatine" selected onToggle={onToggle} />)
    const chip = screen.getByRole('button', { name: 'Creatine' })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(chip)
    expect(onToggle).toHaveBeenCalled()
  })
})

describe('Segmented', () => {
  const options = [
    { value: 'female', label: 'Female' },
    { value: 'male', label: 'Male' },
    { value: 'unsaid', label: 'Prefer not to say' },
  ] as const

  it('is a radiogroup with one choice', () => {
    render(<Segmented label="Sex" options={[...options]} value="male" onChange={() => undefined} />)
    expect(screen.getByRole('radiogroup', { name: 'Sex' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Male' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Female' })).toHaveAttribute('aria-checked', 'false')
  })

  it('moves with the arrow keys', () => {
    const onChange = jest.fn()
    render(<Segmented label="Sex" options={[...options]} value="male" onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Male' }), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('unsaid')
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Male' }), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenCalledWith('female')
  })

  it('keeps one tab stop', () => {
    render(<Segmented label="Sex" options={[...options]} value={null} onChange={() => undefined} />)
    const stops = screen.getAllByRole('radio').filter((r) => r.getAttribute('tabindex') === '0')
    expect(stops).toHaveLength(1)
  })
})

describe('NextButton', () => {
  it('advances when ready', () => {
    const onClick = jest.fn()
    render(<NextButton onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onClick).toHaveBeenCalled()
  })

  it('nudges instead of advancing when the scene is unanswered', () => {
    const onClick = jest.fn()
    render(<NextButton ready={false} nudge="Pick at least one goal." onClick={onClick} />)
    const next = screen.getByRole('button', { name: 'Next' })
    expect(next).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByText('Pick at least one goal.')).toBeNull()
    fireEvent.click(next)
    expect(onClick).not.toHaveBeenCalled()
    expect(screen.getByText('Pick at least one goal.')).toBeInTheDocument()
  })

  it('drops the nudge once the scene changes', () => {
    const { rerender } = render(<NextButton ready={false} nudge="Pick one." resetKey="a" />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Pick one.')).toBeInTheDocument()
    rerender(<NextButton ready={false} nudge="Pick one." resetKey="b" />)
    expect(screen.queryByText('Pick one.')).toBeNull()
  })
})
