'use client'

import { useEffect, useRef } from 'react'
import { AMP_RIVE, AMP_STATE_CODE } from '@/lib/consult/ampRive'
import { stateTransition, type AmpReaction, type AmpState } from '@/lib/consult/motion'

/**
 * The Rive layer over the CSS Amp (build U5). Loaded on demand by `Amp`, so
 * none of this — nor the runtime it imports — is in the first scene's bundle.
 *
 * Calls `onReady` once the first frame is drawn; until then the canvas is
 * invisible and the CSS Amp shows. A file that fails to load just never calls
 * it, and the CSS Amp stays.
 */

type Runtime = typeof import('@rive-app/canvas-lite')
type RiveInstance = InstanceType<Runtime['Rive']>
type Input = NonNullable<ReturnType<RiveInstance['stateMachineInputs']>>[number]

let runtime: Promise<Runtime> | null = null

/** One runtime per page, its WASM served from this site rather than a CDN. */
function loadRuntime(): Promise<Runtime> {
  runtime ??= import('@rive-app/canvas-lite').then((rive) => {
    rive.RuntimeLoader.setWasmUrl(new URL('../../../node_modules/@rive-app/canvas-lite/rive.wasm', import.meta.url).href)
    return rive
  })
  return runtime
}

interface Props {
  state: AmpState
  lean: number
  reaction: { name: AmpReaction; id: number } | null
  ready: boolean
  onReady: () => void
}

export default function AmpRive({ state, lean, reaction, ready, onReady }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const inputs = useRef<Map<string, Input>>(new Map())
  const latest = useRef({ state, lean })
  latest.current = { state, lean }

  useEffect(() => {
    let live = true
    let rive: RiveInstance | null = null
    loadRuntime()
      .then(({ Rive, Layout, Fit, Alignment }) => {
        if (!live || !canvas.current) return
        rive = new Rive({
          src: AMP_RIVE.src,
          canvas: canvas.current,
          artboard: AMP_RIVE.artboard,
          stateMachines: AMP_RIVE.stateMachine,
          autoplay: true,
          layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
          onLoad: () => {
            if (!live || !rive) return
            rive.resizeDrawingSurfaceToCanvas()
            inputs.current = new Map(rive.stateMachineInputs(AMP_RIVE.stateMachine)?.map((i) => [i.name, i]) ?? [])
            apply(inputs.current, latest.current.state, latest.current.lean)
            // Wait one frame so the first drawn frame is on screen before the swap.
            requestAnimationFrame(() => live && onReady())
          },
        })
      })
      .catch(() => undefined)
    return () => {
      live = false
      rive?.cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    apply(inputs.current, state, lean)
  }, [state, lean])

  // U6: each reaction is a trigger input of the same name.
  useEffect(() => {
    if (reaction) inputs.current.get(AMP_RIVE.triggers[reaction.name])?.fire()
  }, [reaction])

  return (
    <canvas
      ref={canvas}
      aria-hidden
      data-amp-rive
      className="absolute inset-0 h-full w-full"
      style={{ opacity: ready ? 1 : 0, transition: stateTransition('opacity') }}
    />
  )
}

function apply(inputs: Map<string, Input>, state: AmpState, lean: number) {
  const s = inputs.get(AMP_RIVE.inputs.state)
  if (s) s.value = AMP_STATE_CODE[state]
  const l = inputs.get(AMP_RIVE.inputs.lean)
  if (l) l.value = Math.round(Math.max(-1, Math.min(1, lean)) * 100)
}
