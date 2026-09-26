import { fireEvent, render, screen } from '@testing-library/react'
import { initialFlow, type FlowState } from '@/lib/consult/flow'
import { ampReactionTo } from '@/lib/consult/reactions'
import { EMPTY_ANSWERS, type ConsultAnswers } from '@/lib/consult/types'
import { AmpConsult } from '../AmpConsult'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

const REST = Array(7).fill('rest') as ConsultAnswers['week']

describe('U6 what sets a reaction off', () => {
  it('flexes when a day becomes a gym day, and only then', () => {
    expect(ampReactionTo({ ...EMPTY_ANSWERS, week: REST }, { week: ['gym', ...REST!.slice(1)] })).toBe('flex')
    expect(ampReactionTo({ ...EMPTY_ANSWERS, week: ['gym', ...REST!.slice(1)] }, { week: ['cardio', ...REST!.slice(1)] })).toBeNull()
  })

  it('bursts when the charge dial reaches full, not while it stays there', () => {
    expect(ampReactionTo({ ...EMPTY_ANSWERS, energy: 9 }, { energy: 10 })).toBe('burst')
    expect(ampReactionTo({ ...EMPTY_ANSWERS, energy: 10 }, { energy: 10 })).toBeNull()
    expect(ampReactionTo({ ...EMPTY_ANSWERS, energy: 9 }, { energy: 8 })).toBeNull()
  })

  it('catches the sun when the daylight answer moves', () => {
    expect(ampReactionTo({ ...EMPTY_ANSWERS, daylight: 'some' }, { daylight: 'daily' })).toBe('sun')
    expect(ampReactionTo({ ...EMPTY_ANSWERS, daylight: 'some' }, { daylight: 'some' })).toBeNull()
  })

  it('has nothing to say about anything else', () => {
    expect(ampReactionTo(EMPTY_ANSWERS, { goals: ['energy'] })).toBeNull()
    expect(ampReactionTo(EMPTY_ANSWERS, { comfort: true })).toBeNull()
  })
})

describe('U6 Amp reacting in the consult', () => {
  const at = (sceneId: FlowState['sceneId'], answers: Partial<ConsultAnswers> = {}): FlowState => ({
    ...initialFlow('c1', 0, { route: 'deep' }),
    sceneId,
    answers: { ...EMPTY_ANSWERS, route: 'deep', goals: ['energy'], comfortOffered: true, ...answers },
  })
  const amp = () => document.querySelector('[data-amp-state]')!
  /** jsdom has no AnimationEvent; React only reads the name. */
  const animationEnd = (name: string) => {
    const e = new Event('animationend', { bubbles: true })
    Object.defineProperty(e, 'animationName', { value: name })
    fireEvent(amp().querySelector('svg')!, e)
  }

  it('flexes on a gym day and settles when the flex has played — no timer', () => {
    render(<AmpConsult initial={at('training')} />)
    fireEvent.click(screen.getByRole('button', { name: /^Monday/ }))
    expect(amp()).toHaveAttribute('data-amp-reaction', 'flex')
    animationEnd('amp-breathe')
    expect(amp()).toHaveAttribute('data-amp-reaction', 'flex')
    animationEnd('amp-flex')
    expect(amp()).not.toHaveAttribute('data-amp-reaction')
  })

  it('plays again on the next gym day', () => {
    render(<AmpConsult initial={at('training')} />)
    fireEvent.click(screen.getByRole('button', { name: /^Monday/ }))
    animationEnd('amp-flex')
    fireEvent.click(screen.getByRole('button', { name: /^Tuesday/ }))
    expect(amp()).toHaveAttribute('data-amp-reaction', 'flex')
  })

  it('bursts when the dial is pushed to full', () => {
    render(<AmpConsult initial={at('energy')} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Afternoon energy' }), { key: 'End' })
    expect(amp()).toHaveAttribute('data-amp-reaction', 'burst')
  })

  it('doesn’t carry a reaction on to the next scene', () => {
    render(<AmpConsult initial={at('training')} />)
    fireEvent.click(screen.getByRole('button', { name: /^Monday/ }))
    fireEvent.click(screen.getByRole('button', { name: /^(Next|Looks right|Continue)$/ }))
    expect(amp()).not.toHaveAttribute('data-amp-reaction')
  })

  it('stays calm in the circuit check', () => {
    render(<AmpConsult initial={at('circuit', { week: REST })} />)
    expect(amp()).toHaveAttribute('data-amp-state', 'calm')
    for (const box of screen.queryAllByRole('checkbox')) fireEvent.click(box)
    expect(amp()).not.toHaveAttribute('data-amp-reaction')
  })
})
