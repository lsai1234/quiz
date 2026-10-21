import { act, fireEvent, render, screen } from '@testing-library/react'
import { SceneRail, SCENE_RAIL_HEIGHT, SCENE_RAIL_RESERVE } from '../SceneRail'
import { Act4Reveal } from '@/components/scroll/Act4Reveal'
import { useQuizStore } from '@/lib/store'

/*
 * The page under Act4Reveal is the whole results page; only the anchors and
 * the bar's space are under test here, so it stands in with the Plan anchor
 * the rail looks for.
 */
jest.mock('@/components/stack-review/StackReviewPage', () => ({
  StackReviewPage: () => <div id="scene-plan">plan</div>,
}))

/**
 * The You · Stack · Plan bar.
 *
 * It used to be a centred, 82%-opaque pill floating over the page, so the line
 * at the top of the screen showed around and through it. It is now a solid,
 * full-width bar whose height the page reserves, and the scene anchors land a
 * jump just below it.
 */

function rem(value: string): number {
  const m = value.match(/^([\d.]+)rem$/)
  if (!m) throw new Error(`not a rem value: ${value}`)
  return Number(m[1])
}

function setScrollY(y: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y })
}

let frames: FrameRequestCallback[] = []
function flushFrames() {
  const run = frames
  frames = []
  act(() => run.forEach((cb) => cb(0)))
}

beforeEach(() => {
  setScrollY(0)
  frames = []
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    frames.push(cb)
    return frames.length
  })
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
  document.body.innerHTML = ''
})

/** jsdom lays nothing out, so each anchor is given the top it would have. */
function placeScenes(tops: { you: number; stack: number; plan: number }) {
  for (const [id, top] of [['scene-you', tops.you], ['scene-stack', tops.stack], ['scene-plan', tops.plan]] as const) {
    document.getElementById(id)!.getBoundingClientRect = () => ({ top }) as DOMRect
  }
}

function renderWithPlan() {
  const view = render(
    <>
      <div id="scene-you" />
      <div id="scene-stack" />
      <div id="scene-plan" />
    </>,
  )
  // The top of the page: You under the bar, the other scenes further down.
  placeScenes({ you: 72, stack: 620, plan: 1550 })
  view.rerender(
    <>
      <div id="scene-you" />
      <div id="scene-stack" />
      <div id="scene-plan" />
      <SceneRail />
    </>,
  )
  return view
}

describe('SceneRail', () => {
  it('is a solid, full-width bar pinned to the top, not a blurred pill', () => {
    renderWithPlan()
    const bar = document.querySelector<HTMLElement>('[data-scene-rail]')!
    expect(bar).toBeInTheDocument()
    // Portaled to <body>, outside the page's transformed wrappers.
    expect(bar.parentElement).toBe(document.body)
    expect(bar).toHaveClass('fixed', 'inset-x-0', 'top-0', 'z-40')
    expect(bar.style.background).toBe('rgb(18, 18, 20)')
    expect(bar.getAttribute('style')).not.toMatch(/blur/)
    // The row the buttons sit in is the height the page reserves.
    const row = bar.firstElementChild as HTMLElement
    expect(row.style.height).toBe(SCENE_RAIL_HEIGHT)
    expect(row.style.borderBottom).toContain('1px solid')
  })

  it('keeps the three scene buttons, with You current at the top of the page', () => {
    renderWithPlan()
    const labels = ['You', 'Stack', 'Plan']
    for (const name of labels) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'You' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: 'Stack' })).not.toHaveAttribute('aria-current')
  })

  it('jumps to a scene by its anchor', () => {
    renderWithPlan()
    const plan = document.getElementById('scene-plan')!
    const spy = jest.fn()
    plan.scrollIntoView = spy
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }))
  })

  it('marks a scene current once its top reaches where a jump to it lands', () => {
    renderWithPlan()
    // 72px is the anchors' 4.5rem margin with no inset; a jump lands it there.
    placeScenes({ you: -478, stack: 72, plan: 1002 })
    setScrollY(550)
    fireEvent.scroll(window)
    flushFrames()
    expect(screen.getByRole('button', { name: 'Stack' })).toHaveAttribute('aria-current', 'true')
  })

  it('gets out of the way while reading down and comes back on the way up', () => {
    renderWithPlan()
    const bar = document.querySelector<HTMLElement>('[data-scene-rail]')!
    setScrollY(400)
    fireEvent.scroll(window)
    flushFrames()
    expect(bar.style.transform).toBe('translateY(-100%)')
    setScrollY(380)
    fireEvent.scroll(window)
    flushFrames()
    expect(bar.style.transform).toBe('translateY(0)')
  })

  it('is not shown where the plan scene does not exist', () => {
    render(<SceneRail />)
    expect(document.querySelector('[data-scene-rail]')).toBeNull()
  })

  it('leaves room for a gap between the bar and a scene that a jump lands', () => {
    // The anchors' margin is 4.5rem past the inset; the bar must stay shorter.
    expect(4.5 - rem(SCENE_RAIL_HEIGHT)).toBeGreaterThanOrEqual(0.5)
    expect(SCENE_RAIL_RESERVE).toBe(`calc(env(safe-area-inset-top, 0px) + ${SCENE_RAIL_HEIGHT})`)
  })
})

describe('Act4Reveal and the bar', () => {
  /*
   * Act4Reveal is the shell now: the bar and the page the scenes sit on. The
   * scenes, the You scene included, are StackReviewPage's, and their anchors
   * are checked against the real page in `you-scene.test.tsx`.
   */
  afterEach(() => act(() => useQuizStore.setState({ identity: null })))

  it('reserves the bar at the top and the checkout bar at the bottom, on the dark panel', () => {
    render(<Act4Reveal reducedMotion />)
    const root = document.querySelector('[data-reveal-shell]')!
    expect(root.getAttribute('style')).toContain('safe-area-inset-top')
    expect(root.getAttribute('style')).toContain(SCENE_RAIL_HEIGHT)
    // On the light shell it showed as a light strip under the dark panel; the
    // panel carries it now (checked against the real page in you-scene.test).
    expect(root.className).not.toMatch(/\bpb-/)
  })

  it('renders without an AI identity', () => {
    // It used to render nothing until /api/generate-identity had answered.
    act(() => useQuizStore.setState({ identity: null }))
    render(<Act4Reveal reducedMotion />)
    expect(document.querySelector('[data-reveal-shell]')).not.toBeNull()
    expect(screen.getByText('plan')).toBeInTheDocument()
  })

  it('shows nothing from an identity that is still in the store', () => {
    // A consult still sets one. The reveal does not read it.
    act(() => useQuizStore.setState({
      identity: {
        name: 'Test Identity',
        archetype: 'Test archetype',
        description: 'Test description.',
        focusAreas: ['Sleep'],
        routineFitScore: 80,
      },
    }))
    render(<Act4Reveal reducedMotion />)
    for (const text of ['Test Identity', 'Test archetype', 'Test description.', 'Routine fit', 'Fully charged']) {
      expect(screen.queryByText(text)).not.toBeInTheDocument()
    }
  })
})
