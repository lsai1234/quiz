import { fireEvent, render, screen } from '@testing-library/react'
import { ChargeMeter, chargePercent, type MeterSection } from '../ChargeMeter'

const sections = (fills: number[]): MeterSection[] =>
  fills.map((fill, i) => ({ id: `s${i}`, label: `Section ${i}`, fill }))

describe('ChargeMeter', () => {
  it('reads as the share of the consult answered', () => {
    expect(chargePercent(sections([1, 1, 0.5, 0]))).toBe(63)
    expect(chargePercent(sections([0, 0, 0]))).toBe(0)
    expect(chargePercent(sections([1, 1]))).toBe(100)
    expect(chargePercent([])).toBe(0)
  })

  it('clamps a fill out of range rather than overcharging', () => {
    expect(chargePercent(sections([2, -1]))).toBe(50)
  })

  it('names its charge for a screen reader', () => {
    render(<ChargeMeter sections={sections([1, 0.5, 0])} currentId="s1" />)
    expect(screen.getByRole('group', { name: 'Charge 50%' })).toBeInTheDocument()
  })

  it('jumps back to a completed section', () => {
    const onJump = jest.fn()
    render(<ChargeMeter sections={sections([1, 1, 0.5, 0])} currentId="s2" onJump={onJump} />)
    fireEvent.click(screen.getByRole('button', { name: 'Back to Section 0' }))
    expect(onJump).toHaveBeenCalledWith('s0')
  })

  it('does not let you jump to the current section or ahead of it', () => {
    render(<ChargeMeter sections={sections([1, 1, 0.5, 0])} currentId="s2" onJump={jest.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Back to Section 2' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Back to Section 3' })).toBeNull()
  })

  it('is read-only without a jump handler', () => {
    render(<ChargeMeter sections={sections([1, 1, 0])} currentId="s2" />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
