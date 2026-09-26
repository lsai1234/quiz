import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { SCENES } from '@/lib/consult/flow'
import { EMPTY_ANSWERS, type ConsultAnswers, type ShelfItem } from '@/lib/consult/types'
import { resetQuizArm, setQuizArm } from '@/lib/experiments/client'
import { AmpConsult } from '../AmpConsult'
import { ShelfCheck, mergeShelf } from '../scenes/ShelfCheck'
import { UploadSheet } from '../UploadSheet'
import { trackerPatch } from '../TrackerSheet'
import { answerCurrentScene, chooseRoute, heading, pressNext } from './drive'

// jsdom has no canvas: the shrink step hands back a fixed small image.
jest.mock('../downscale', () => ({ downscale: async () => 'data:image/jpeg;base64,AAAA' }))

const photo = () => new File(['x'], 'shelf.jpg', { type: 'image/jpeg' })
const upload = async () => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  await act(async () => {
    fireEvent.change(input, { target: { files: [photo()] } })
  })
}
const tick = () => fireEvent.click(screen.getByRole('checkbox'))

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetQuizArm()
})

describe('upload sheet', () => {
  it('won’t open the camera until the consent line is ticked', () => {
    render(<UploadSheet title="Scan" consent="Send it once." read={async () => []} onConfirm={jest.fn()} onClose={jest.fn()} onReading={jest.fn()}>{null}</UploadSheet>)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const click = jest.spyOn(input, 'click')
    fireEvent.click(screen.getByRole('button', { name: /Take or choose a photo/ }))
    expect(click).not.toHaveBeenCalled()
    tick()
    fireEvent.click(screen.getByRole('button', { name: /Take or choose a photo/ }))
    expect(click).toHaveBeenCalled()
  })

  it('shows what was found as cards, each removable, and uses only what’s left', async () => {
    const onConfirm = jest.fn()
    const onReading = jest.fn()
    render(
      <UploadSheet
        title="Scan"
        consent="Send it once."
        read={async () => [{ key: 'a', label: 'Creatine' }, { key: 'b', label: 'Omega-3' }]}
        onConfirm={onConfirm}
        onClose={jest.fn()}
        onReading={onReading}
      >
        {null}
      </UploadSheet>,
    )
    tick()
    await upload()
    expect(onReading.mock.calls).toEqual([[true], [false]])
    fireEvent.click(screen.getByRole('button', { name: 'Remove Omega-3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Use these' }))
    expect(onConfirm).toHaveBeenCalledWith(['a'])
  })

  it('says so and offers another go when nothing could be read', async () => {
    render(<UploadSheet title="Scan" consent="c" read={async () => null} onConfirm={jest.fn()} onClose={jest.fn()} onReading={jest.fn()}>{null}</UploadSheet>)
    tick()
    await upload()
    expect(screen.getByText(/couldn’t read that one/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try another photo' }))
    expect(screen.getByRole('button', { name: /Take or choose a photo/ })).toBeInTheDocument()
  })
})

describe('U1 shelf scan', () => {
  function Harness({ ai, scan, start = null }: { ai: boolean; scan?: (i: string) => Promise<ShelfItem[] | null>; start?: ShelfItem[] | null }) {
    const [answers, setAnswers] = useState<ConsultAnswers>({ ...EMPTY_ANSWERS, shelf: start })
    return <ShelfCheck scene={SCENES.find((s) => s.id === 'shelf')!} answers={answers} onAnswer={(p) => setAnswers({ ...answers, ...p })} comfort={false} order={[]} onEdit={() => undefined} ai={ai} scan={scan} />
  }

  it('is only offered with the AI layer on', () => {
    render(<Harness ai={false} />)
    expect(screen.queryByRole('button', { name: 'Scan my shelf instead' })).toBeNull()
  })

  it('adds confirmed finds to what was already tapped', async () => {
    const scan = jest.fn(async () => ['creatine', 'omega-3'] as ShelfItem[])
    render(<Harness ai scan={scan} start={['protein']} />)
    fireEvent.click(screen.getByRole('button', { name: 'Scan my shelf instead' }))
    expect(screen.getByText(/any medicines in it are ignored/)).toBeInTheDocument()
    tick()
    await upload()
    expect(scan).toHaveBeenCalledWith('data:image/jpeg;base64,AAAA')
    fireEvent.click(screen.getByRole('button', { name: 'Use these' }))
    for (const name of ['Protein', 'Creatine', 'Omega-3']) expect(screen.getByRole('button', { name: new RegExp(`^${name}`) })).toHaveAttribute('aria-pressed', 'true')
  })

  it('merges without duplicates, and never clears on an empty find', () => {
    expect(mergeShelf(['protein'], ['protein', 'creatine'])).toEqual(['protein', 'creatine'])
    expect(mergeShelf(null, [])).toBeNull()
  })
})

describe('U2 tracker read', () => {
  const read = { bed: 23 * 60, wake: 6 * 60 + 30, quality: null, week: ['gym', 'rest', 'gym', 'rest', 'cardio', 'rest', 'rest'] as ConsultAnswers['week'] }

  it('fills only the confirmed answers, keeping a sleep quality already given', () => {
    const answers = { ...EMPTY_ANSWERS, sleep: { bed: 0, wake: 480, quality: 'broken' as const } }
    expect(trackerPatch(read, ['sleep'], answers)).toEqual({ sleep: { bed: 1380, wake: 390, quality: 'broken' } })
    expect(trackerPatch(read, ['week'], answers)).toEqual({ week: read.week })
  })

  function mockScan(body: unknown) {
    global.fetch = jest.fn(async (url: RequestInfo | URL) => ({ ok: true, json: async () => (String(url) === '/api/consult/scan' ? body : { fallback: true }) }) as unknown as Response) as typeof fetch
  }
  const toTraining = () => {
    chooseRoute()
    fireEvent.click(screen.getByRole('button', { name: /^Energy/ }))
    pressNext()
    answerCurrentScene()
    pressNext()
    expect(heading().textContent).toBe(SCENES.find((s) => s.id === 'training')!.copy.question)
  }

  it('is offered on the long route with the AI on, and not without it', () => {
    mockScan({})
    const { unmount } = render(<AmpConsult />)
    toTraining()
    expect(screen.queryByRole('button', { name: 'Fill from my tracker' })).toBeNull()
    unmount()
    localStorage.clear()
    sessionStorage.clear()
    setQuizArm({ arm: 'v1', consultAi: true })
    render(<AmpConsult />)
    toTraining()
    expect(screen.getByRole('button', { name: 'Fill from my tracker' })).toBeInTheDocument()
  })

  it('reads a screenshot into the week and the sleep window, with Amp reading meanwhile', async () => {
    setQuizArm({ arm: 'v1', consultAi: true })
    let release: (v: unknown) => void = () => undefined
    global.fetch = jest.fn(
      async (url: RequestInfo | URL) =>
        String(url) === '/api/consult/scan'
          ? new Promise<Response>((r) => { release = (v) => r({ ok: true, json: async () => v } as unknown as Response) })
          : ({ ok: true, json: async () => ({ fallback: true }) } as unknown as Response),
    ) as typeof fetch
    render(<AmpConsult />)
    toTraining()
    fireEvent.click(screen.getByRole('button', { name: 'Fill from my tracker' }))
    tick()
    expect(screen.getByRole('button', { name: /Take or choose a photo/ })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Oura' }))
    expect(screen.getByText(/Screenshot this: Sleep → the Trends view/)).toBeInTheDocument()
    await upload()
    expect(document.querySelector('[data-amp-state="reading"]')).not.toBeNull()
    const body = JSON.parse(String((global.fetch as jest.Mock).mock.calls.find(([u]) => u === '/api/consult/scan')[1].body))
    expect(body).toMatchObject({ kind: 'tracker', app: 'oura' })
    await act(async () => release({ read: { ...read, bed: 1380, wake: 390 } }))
    expect(screen.getByText('Sleep 23:00 → 06:30')).toBeInTheDocument()
    expect(screen.getByText('3 workouts this week')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use these' }))
    expect(document.querySelector('[data-amp-state="reading"]')).toBeNull()
    expect(screen.getByRole('button', { name: /^Wednesday/ })).toHaveAccessibleName('Wednesday: Gym. Tap to change.')
    expect(screen.getByRole('button', { name: /^Friday/ })).toHaveAccessibleName('Friday: Cardio. Tap to change.')
  })
})
