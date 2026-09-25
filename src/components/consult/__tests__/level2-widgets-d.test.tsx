import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { SCENES, flowReducer, initialFlow, isAnswered, resolveSceneDef, visibleScenes } from '@/lib/consult/flow'
import { EMPTY_ANSWERS, type ConsultAnswers } from '@/lib/consult/types'
import { SceneRenderer } from '../scenes/registry'
import { toggleShelf } from '../scenes/ShelfCheck'
import { AmpConsult } from '../AmpConsult'
import { chooseRoute, heading, pickFirstOptionAndNext } from './drive'

function Harness({ id, start = {}, spy }: { id: string; start?: Partial<ConsultAnswers>; spy?: (a: ConsultAnswers) => void }) {
  const [answers, setAnswers] = useState<ConsultAnswers>({ ...EMPTY_ANSWERS, ...start })
  return (
    <SceneRenderer
      scene={resolveSceneDef(SCENES.find((s) => s.id === id)!.id, answers)}
      answers={answers}
      comfort={false}
      order={SCENES.map((s) => s.id)}
      onEdit={() => undefined}
      onAnswer={(patch) => {
        const next = { ...answers, ...patch }
        setAnswers(next)
        spy?.(next)
      }}
    />
  )
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('C11 shelf check', () => {
  const chip = (name: string) => screen.getByRole('button', { name })

  it('picks what they already take', () => {
    const spy = jest.fn()
    render(<Harness id="shelf" spy={spy} />)
    fireEvent.click(chip('Creatine'))
    fireEvent.click(chip('Omega-3'))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ shelf: ['creatine', 'omega-3'] }))
  })

  it('"Nothing yet" clears the others', () => {
    const spy = jest.fn()
    render(<Harness id="shelf" start={{ shelf: ['creatine', 'protein'] }} spy={spy} />)
    fireEvent.click(chip('Nothing yet'))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ shelf: [] }))
    expect(chip('Creatine')).toHaveAttribute('aria-pressed', 'false')
    expect(chip('Nothing yet')).toHaveAttribute('aria-pressed', 'true')
  })

  it('picking anything clears "Nothing yet"', () => {
    const spy = jest.fn()
    render(<Harness id="shelf" start={{ shelf: [] }} spy={spy} />)
    fireEvent.click(chip('Magnesium'))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ shelf: ['magnesium'] }))
    expect(chip('Nothing yet')).toHaveAttribute('aria-pressed', 'false')
  })

  it('untapping the last item goes back to unanswered', () => {
    expect(toggleShelf(['creatine'], 'creatine')).toBeNull()
  })
})

describe('C12 branching', () => {
  const perf: ConsultAnswers = { ...EMPTY_ANSWERS, goals: ['performance'] }
  const ageing: ConsultAnswers = { ...EMPTY_ANSWERS, goals: ['ageing'] }

  it('gives the training week detail for performance', () => {
    expect(resolveSceneDef('training', perf).detail).toBe(true)
    expect(resolveSceneDef('training', { ...EMPTY_ANSWERS, goals: ['energy'] }).detail).toBeFalsy()
  })

  it('asks how hard sessions feel once there are sessions, and needs an answer', () => {
    const spy = jest.fn()
    render(<Harness id="training" start={{ goals: ['performance'] }} spy={spy} />)
    expect(screen.queryByRole('radiogroup', { name: 'How hard do most sessions feel?' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Monday/ }))
    expect(isAnswered('training', { ...perf, week: ['gym', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest'] })).toBe(false)
    fireEvent.click(screen.getByRole('radio', { name: 'Flat out' }))
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ intensity: 'hard' }))
  })

  it("doesn't ask how hard a rest week is", () => {
    expect(isAnswered('training', { ...perf, week: Array(7).fill('rest') })).toBe(true)
  })

  it('emphasises the body map for healthy ageing and older bands', () => {
    expect(resolveSceneDef('body', ageing).emphasis).toBe(true)
    expect(resolveSceneDef('body', { ...EMPTY_ANSWERS, age: '65-plus' }).emphasis).toBe(true)
    expect(resolveSceneDef('body', { ...EMPTY_ANSWERS, age: '25-34' }).emphasis).toBeFalsy()
    expect(resolveSceneDef('body', ageing).copy.question).toBe('Which joints need looking after?')
  })

  it('keeps the interaction the same whatever the variant', () => {
    for (const s of SCENES) {
      for (const a of [perf, ageing, EMPTY_ANSWERS]) expect(resolveSceneDef(s.id, a).interaction).toBe(s.interaction)
    }
  })

  it('branches the speed run too: the body map joins it for healthy ageing', () => {
    expect(visibleScenes({ ...EMPTY_ANSWERS, route: 'speed' })).not.toContain('body')
    expect(visibleScenes({ ...ageing, route: 'speed' })).toContain('body')
    expect(visibleScenes({ ...EMPTY_ANSWERS, route: 'speed', age: '55-64' })).toContain('body')
  })

  it('branches the deep charge the same way', () => {
    expect(visibleScenes({ ...perf, route: 'deep' })).toHaveLength(12)
    expect(resolveSceneDef('training', { ...perf, route: 'deep' }).detail).toBe(true)
  })
})

describe('C13 speed run or deep charge', () => {
  it('offers the choice at the start', () => {
    render(<AmpConsult />)
    expect(heading()).toHaveTextContent('How much time have you got?')
    expect(screen.getByRole('radio', { name: /^Speed run/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^Deep charge/ })).toBeInTheDocument()
  })

  it('runs fewer scenes on a speed run', () => {
    const speed = visibleScenes({ ...EMPTY_ANSWERS, route: 'speed' })
    const deep = visibleScenes({ ...EMPTY_ANSWERS, route: 'deep' })
    expect(speed.length).toBeLessThan(deep.length)
    expect(speed).toEqual(expect.arrayContaining(['goals', 'review', 'circuit']))
  })

  it('finishes a speed run in under a minute of tapping', () => {
    // A generous 5 seconds a scene still has to land under 60.
    expect(visibleScenes({ ...EMPTY_ANSWERS, route: 'speed' }).length * 5).toBeLessThan(60)
  })

  it('still passes through the review and the circuit check on a speed run', () => {
    let s = flowReducer(initialFlow('c', 0), { type: 'route', route: 'speed' })
    const seen: string[] = []
    for (let guard = 0; guard < 20 && s.phase === 'scenes'; guard++) {
      seen.push(s.sceneId)
      const def = SCENES.find((d) => d.id === s.sceneId)!
      const opt = def.placeholder?.options[0]
      if (opt?.set) s = flowReducer(s, { type: 'answer', patch: opt.set })
      if (opt?.toggle) s = flowReducer(s, { type: 'answer', patch: { goals: ['energy'] } })
      s = flowReducer(s, { type: 'next' })
    }
    expect(seen.slice(-2)).toEqual(['review', 'circuit'])
    expect(s.phase).toBe('analysis')
  })

  it('clicks through a whole speed run', () => {
    render(<AmpConsult />)
    chooseRoute('Speed run')
    const total = visibleScenes({ ...EMPTY_ANSWERS, route: 'speed' }).length
    expect(screen.getByText(`1/${total} · Goals`)).toBeInTheDocument()
    for (let i = 0; i < total; i++) pickFirstOptionAndNext()
    expect(heading()).toHaveTextContent("Everything's in")
  })
})
