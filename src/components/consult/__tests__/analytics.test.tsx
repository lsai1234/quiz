import { fireEvent, render, screen } from '@testing-library/react'
import { AmpConsult } from '../AmpConsult'
import { chooseRoute, pickFirstOptionAndNext, pressNext } from './drive'
import * as events from '@/lib/analytics/events'
import { CONSULT_EVENTS } from '@/lib/analytics/events'

jest.mock('@/lib/analytics/events', () => {
  const actual = jest.requireActual('@/lib/analytics/events')
  return { ...actual, track: jest.fn() }
})

const track = events.track as jest.Mock
const named = (name: string) => track.mock.calls.filter(([e]) => e === name).map(([, p]) => p)

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  track.mockClear()
})

describe('H12 consult instrumentation', () => {
  it('reports the start, each scene viewed and completed, with time and touches', () => {
    render(<AmpConsult />)
    chooseRoute()
    expect(named('consult_start')).toEqual([{ route: 'deep' }])
    expect(named('consult_scene_view')[0]).toMatchObject({ sceneId: 'goals', index: 1, total: 12 })
    fireEvent.click(screen.getByRole('button', { name: /^Energy/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Focus/ }))
    pressNext()
    const done = named('consult_scene_complete')[0]
    expect(done).toMatchObject({ sceneId: 'goals', index: 1, interactions: 2 })
    expect(typeof done.msOnScene).toBe('number')
    expect(named('consult_scene_view')[1]).toMatchObject({ sceneId: 'about', index: 2 })
  })

  it('reports a step back', () => {
    render(<AmpConsult />)
    chooseRoute()
    pickFirstOptionAndNext()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(named('consult_scene_back')).toEqual([{ from: 'about', to: 'goals', via: 'back' }])
  })

  it('reports a circuit check stop by kind only', () => {
    render(<AmpConsult />)
    chooseRoute()
    for (let i = 0; i < 11; i++) pickFirstOptionAndNext()
    fireEvent.click(screen.getByRole('checkbox', { name: /^Use my answers here/ }))
    fireEvent.click(screen.getByRole('switch', { name: 'Kidney or liver condition' }))
    pressNext()
    expect(named('consult_stop')).toEqual([{ reason: 'kidney-liver' }])
  })

  it('never sends an answer', () => {
    render(<AmpConsult />)
    chooseRoute()
    for (let i = 0; i < 6; i++) pickFirstOptionAndNext()
    const sent = JSON.stringify(track.mock.calls)
    expect(sent).not.toMatch(/performance|18-24|gym|restful|hardly/)
  })

  it('reports leaving mid-consult from the last scene seen', () => {
    render(<AmpConsult />)
    chooseRoute()
    pickFirstOptionAndNext()
    window.dispatchEvent(new Event('pagehide'))
    expect(named('consult_abandon')).toEqual([{ lastSceneId: 'about' }])
  })

  it('uses only event names the analytics sink accepts', () => {
    render(<AmpConsult />)
    chooseRoute()
    pickFirstOptionAndNext()
    for (const [name] of track.mock.calls) {
      if (String(name).startsWith('consult_')) expect(CONSULT_EVENTS).toContain(name)
    }
  })
})
