import { render, screen } from '@testing-library/react'
import { SCENES } from '@/lib/consult/flow'
import { EMPTY_ANSWERS } from '@/lib/consult/types'
import { SCENE_REGISTRY, SceneRenderer, resolveScene, structuredPatch } from '../scenes/registry'
import { PlaceholderScene } from '../scenes/PlaceholderScene'

describe('the scene registry', () => {
  it('resolves every scene in the script to a component', () => {
    for (const scene of SCENES) expect(resolveScene(scene).component).toBeDefined()
  })

  it('falls back to the scripted placeholder for a scene not built yet', () => {
    const unbuilt = SCENES.find((s) => !SCENE_REGISTRY[s.interaction])!
    expect(resolveScene(unbuilt).component).toBe(PlaceholderScene)
  })

  it('lets each scene write exactly what its scripted answers set, and nothing more', () => {
    for (const scene of SCENES.filter((s) => s.placeholder)) {
      const { writes } = resolveScene(scene)
      const touched = new Set(
        scene.placeholder!.options.flatMap((o) => (o.set ? Object.keys(o.set) : o.toggle ? [o.toggle[0]] : [])),
      )
      expect([...touched].sort()).toEqual([...writes].sort())
    }
  })

  it('drops fields a scene was not registered to write', () => {
    const goals = resolveScene(SCENES[0])
    expect(structuredPatch(goals, { goals: ['energy'], energy: 3 })).toEqual({ goals: ['energy'] })
  })

  it('renders through one renderer, with a structured answer out', () => {
    const onAnswer = jest.fn()
    render(
      <SceneRenderer
        scene={SCENES[0]}
        answers={EMPTY_ANSWERS}
        onAnswer={onAnswer}
        comfort={false}
        order={SCENES.map((s) => s.id)}
        onEdit={() => undefined}
      />,
    )
    screen.getByRole('button', { name: /^Focus/ }).click()
    expect(onAnswer).toHaveBeenCalledWith({ goals: ['focus'] })
  })
})
