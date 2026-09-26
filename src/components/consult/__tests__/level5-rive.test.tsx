import { act, render, waitFor } from '@testing-library/react'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { AMP_RIVE, AMP_RIV_BUDGET, AMP_STATE_CODE } from '@/lib/consult/ampRive'

// The Rive layer, stubbed: it "draws" on the next tick and says so.
jest.mock('../AmpRive', () => {
  const { useEffect } = jest.requireActual('react')
  return {
    __esModule: true,
    default: function Stub({ onReady, ready, reaction }: { onReady: () => void; ready: boolean; reaction: unknown }) {
      ;(globalThis as unknown as { lastReaction: unknown }).lastReaction = reaction
      useEffect(() => {
        const t = setTimeout(onReady, 0)
        return () => clearTimeout(t)
      }, [onReady])
      return <canvas data-amp-rive style={{ opacity: ready ? 1 : 0 }} />
    },
  }
})

const reduced = { current: false }
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => reduced.current }))

import { Amp } from '../Amp'

const settle = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 10))
  })

afterEach(() => {
  delete process.env.NEXT_PUBLIC_AMP_RIVE
  reduced.current = false
})

describe('U5 Amp in Rive: the contract', () => {
  it('gives every Amp state its own input value', () => {
    const codes = Object.values(AMP_STATE_CODE)
    expect(new Set(codes).size).toBe(codes.length)
    expect(Object.keys(AMP_STATE_CODE).sort()).toEqual(['calm', 'charged', 'idle', 'reading', 'thinking', 'watching'])
  })

  it('keeps the animation file inside its budget', () => {
    const file = path.join(process.cwd(), 'public', AMP_RIVE.src)
    // Until the designer's file lands there's nothing to weigh; once it does, this guards it.
    if (existsSync(file)) expect(statSync(file).size).toBeLessThan(AMP_RIV_BUDGET)
  })

  it('never puts the runtime on the first scene’s path: Amp only imports it lazily', () => {
    const src = readFileSync(path.join(__dirname, '..', 'Amp.tsx'), 'utf8')
    expect(src).not.toMatch(/from ['"]@rive-app/)
    expect(src).not.toMatch(/from ['"]\.\/AmpRive['"]/)
    expect(src).toMatch(/dynamic\(\(\) => import\('\.\/AmpRive'\)/)
  })
})

describe('U5 Amp in Rive: the handover', () => {
  it('draws the CSS Amp alone while Rive is off', async () => {
    const { container } = render(<Amp state="idle" />)
    await settle()
    expect(container.querySelector('canvas')).toBeNull()
    expect(container.querySelector('[data-amp-drawn]')).toHaveAttribute('data-amp-drawn', 'css')
  })

  it('shows the CSS Amp until Rive has drawn, then hands over — never nothing', async () => {
    process.env.NEXT_PUBLIC_AMP_RIVE = '1'
    const { container } = render(<Amp state="thinking" />)
    const amp = container.querySelector('[data-amp-drawn]')!
    expect(amp).toHaveAttribute('data-amp-drawn', 'css')
    expect(container.querySelector('svg')).toHaveStyle({ opacity: '1' })
    await waitFor(() => expect(amp).toHaveAttribute('data-amp-drawn', 'rive'))
    expect(container.querySelector('canvas')).toHaveStyle({ opacity: '1' })
    expect(container.querySelector('svg')).toHaveStyle({ opacity: '0' })
    expect(amp).toHaveAttribute('aria-label', 'Amp, thinking')
  })

  it('hands each reaction to Rive, whose file fires the trigger of the same name', async () => {
    process.env.NEXT_PUBLIC_AMP_RIVE = '1'
    const { rerender, container } = render(<Amp state="idle" />)
    await waitFor(() => expect(container.querySelector('[data-amp-drawn]')).toHaveAttribute('data-amp-drawn', 'rive'))
    rerender(<Amp state="idle" reaction={{ name: 'flex', id: 1 }} />)
    expect((globalThis as unknown as { lastReaction: unknown }).lastReaction).toEqual({ name: 'flex', id: 1 })
    expect(AMP_RIVE.triggers).toEqual({ flex: 'flex', sun: 'sun', burst: 'burst' })
  })

  it('stays with the still CSS Amp under reduced motion', async () => {
    process.env.NEXT_PUBLIC_AMP_RIVE = '1'
    reduced.current = true
    const { container } = render(<Amp state="idle" />)
    await settle()
    expect(container.querySelector('canvas')).toBeNull()
  })
})
