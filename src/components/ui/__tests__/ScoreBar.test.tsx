import React from 'react'
import { render, screen } from '@testing-library/react'
import { ScoreBar, OverallScore } from '../ScoreBar'

// ─── ScoreBar ─────────────────────────────────────────────────────────────────

describe('ScoreBar', () => {
  it('renders the label text', () => {
    render(<ScoreBar label="Hook strength" score={85} />)
    expect(screen.getByText('Hook strength')).toBeInTheDocument()
  })

  it('renders the numeric score', () => {
    render(<ScoreBar label="Relatability" score={72} />)
    expect(screen.getByText('72')).toBeInTheDocument()
  })

  it('sets the bar width to match the score percentage', () => {
    const { container } = render(<ScoreBar label="Test" score={60} />)
    const bar = container.querySelector('[style*="width"]')
    expect(bar).toHaveStyle({ width: '60%' })
  })

  it('uses emerald colour for score ≥ 90', () => {
    const { container } = render(<ScoreBar label="Test" score={95} />)
    const bar = container.querySelector('[style*="width"]')
    expect(bar).toHaveClass('bg-emerald-500')
  })

  it('uses orange colour for score 80–89', () => {
    const { container } = render(<ScoreBar label="Test" score={84} />)
    const bar = container.querySelector('[style*="width"]')
    expect(bar).toHaveClass('bg-orange-400')
  })

  it('uses amber colour for score 70–79', () => {
    const { container } = render(<ScoreBar label="Test" score={75} />)
    const bar = container.querySelector('[style*="width"]')
    expect(bar).toHaveClass('bg-amber-500')
  })

  it('uses red colour for score below 70', () => {
    const { container } = render(<ScoreBar label="Test" score={55} />)
    const bar = container.querySelector('[style*="width"]')
    expect(bar).toHaveClass('bg-red-500')
  })
})

// ─── OverallScore ─────────────────────────────────────────────────────────────

describe('OverallScore', () => {
  it('renders the score number', () => {
    render(<OverallScore score={84} />)
    expect(screen.getByText('84')).toBeInTheDocument()
  })

  it('shows "Queue after review" for score ≥ 90', () => {
    render(<OverallScore score={92} />)
    expect(screen.getByText('Queue after review')).toBeInTheDocument()
  })

  it('shows "Strong — minor edits" for score 80–89', () => {
    render(<OverallScore score={84} />)
    expect(screen.getByText('Strong — minor edits')).toBeInTheDocument()
  })

  it('shows "Needs improvement" for score 70–79', () => {
    render(<OverallScore score={74} />)
    expect(screen.getByText('Needs improvement')).toBeInTheDocument()
  })

  it('shows "Do not queue yet" for score below 70', () => {
    render(<OverallScore score={60} />)
    expect(screen.getByText('Do not queue yet')).toBeInTheDocument()
  })
})
