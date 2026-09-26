import { act, fireEvent, render } from '@testing-library/react'
import axe from 'axe-core'
import { SCENES, initialFlow, type FlowState } from '@/lib/consult/flow'
import { EMPTY_ANSWERS, type ConsultAnswers, type SceneId } from '@/lib/consult/types'
import { AmpConsult } from '../AmpConsult'
import { TellAmpMore } from '../TellAmpMore'
import { TrackerSheet } from '../TrackerSheet'

/**
 * U7: every screen of the consult through axe, at both sizes.
 *
 * jsdom has no layout, so colour contrast is checked where it can be — the
 * token contrast suite (`consult-tokens.test.ts`) and the browser audit
 * (`e2e/specs/19-consult-a11y.spec.ts`). Everything else axe knows runs here.
 */

async function audit(container: Element) {
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  })
  return result.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}

const ANSWERED: Partial<ConsultAnswers> = {
  route: 'deep',
  goals: ['performance', 'sleep', 'ageing'],
  age: '35-44',
  sex: 'female',
  week: ['gym', 'rest', 'cardio', 'rest', 'gym', 'sport', 'rest'],
  intensity: 'steady',
  energy: 6,
  sleep: { bed: 23 * 60, wake: 7 * 60, quality: 'ok' },
  daylight: 'some',
  caffeine: { coffee: 2, tea: 1, energy: 0 },
  plate: ['eggs', 'poultry', 'greens'],
  body: ['knees'],
  shelf: ['creatine'],
  comfortOffered: true,
}

const at = (sceneId: SceneId, answers: Partial<ConsultAnswers>): FlowState => ({
  ...initialFlow('a11y', 0, { route: 'deep' }),
  sceneId,
  answers: { ...EMPTY_ANSWERS, ...answers },
})

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe.each([
  ['standard', false],
  ['comfort', true],
])('U7 axe, %s size', (_name, comfort) => {
  it.each(SCENES.map((s) => s.id))('%s, unanswered', async (id) => {
    const { container } = render(<AmpConsult initial={at(id, { route: 'deep', goals: ['performance', 'sleep', 'ageing'], comfort, comfortOffered: true })} />)
    expect(await audit(container)).toEqual([])
  })

  it.each(SCENES.map((s) => s.id))('%s, answered', async (id) => {
    const { container } = render(<AmpConsult initial={at(id, { ...ANSWERED, comfort })} />)
    expect(await audit(container)).toEqual([])
  })
})

describe('U7 axe, the rest', () => {
  it('the route choice', async () => {
    const { container } = render(<AmpConsult initial={initialFlow('a11y', 0)} />)
    expect(await audit(container)).toEqual([])
  })

  it('the stop screen', async () => {
    const { container } = render(<AmpConsult initial={{ ...at('circuit', { ...ANSWERED, age: 'under-18' }), phase: 'stop' }} />)
    expect(await audit(container)).toEqual([])
  })

  it('the analysis and handoff', async () => {
    const { container } = render(<AmpConsult initial={{ ...at('review', { ...ANSWERED, circuit: { flags: [], none: true }, healthConsent: { accepted: true, version: 'x', at: 'x' } }), phase: 'analysis' }} loadProducts={() => new Promise(() => {})} />)
    await act(async () => undefined)
    expect(await audit(container)).toEqual([])
  })

  it('"Tell Amp more", with the mic', async () => {
    const { container } = render(<TellAmpMore scene={SCENES[2]} onAdd={jest.fn()} onClose={jest.fn()} onThinking={jest.fn()} voice />)
    expect(await audit(container)).toEqual([])
  })

  it('the tracker sheet', async () => {
    const { container } = render(<TrackerSheet answers={EMPTY_ANSWERS} onFill={jest.fn()} onReading={jest.fn()} onClose={jest.fn()} />)
    expect(await audit(container)).toEqual([])
  })
})

describe('U7 keyboard: arrows move through tile radio groups', () => {
  it('steps through the age bands in comfort mode, picking as it goes', () => {
    const { getByRole } = render(<AmpConsult initial={at('about', { route: 'deep', goals: ['energy'], comfort: true, comfortOffered: true })} />)
    const under = getByRole('radio', { name: 'Under 18' })
    under.focus()
    fireEvent.keyDown(under, { key: 'ArrowDown' })
    expect(getByRole('radio', { name: '18–24' })).toHaveFocus()
    expect(getByRole('radio', { name: '18–24' })).toHaveAttribute('aria-checked', 'true')
  })

  it('only moves focus on the route choice, which navigates when picked', () => {
    const { getByRole } = render(<AmpConsult initial={initialFlow('a11y', 0)} />)
    const speed = getByRole('radio', { name: /^Speed run/ })
    speed.focus()
    fireEvent.keyDown(speed, { key: 'ArrowDown' })
    expect(getByRole('radio', { name: /^Deep charge/ })).toHaveFocus()
    expect(getByRole('heading', { level: 1 })).toHaveTextContent('How much time have you got?')
  })
})
