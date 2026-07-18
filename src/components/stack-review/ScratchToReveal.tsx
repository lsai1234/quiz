'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  formatGBP,
  getPricingConfig,
  rollScratchDiscount,
  scratchOutcomes,
} from '@/lib/stack-blueprint/pricing'

const ACCENT = '#00D4FF'
/** Fraction of the coating that must be scratched off before it auto-reveals. */
const REVEAL_THRESHOLD = 0.55
/** Radius (px) of the brush that erases the coating as you drag. */
const BRUSH_RADIUS = 22

interface Props {
  /** The flat monthly total the first-month discount is applied to. */
  monthlyTotal: number
  /** The rate already revealed (from the store), or null if not scratched yet. */
  revealed: number | null
  /** Called once, with the revealed rate, when the card is scratched enough. */
  onReveal: (rate: number) => void
}

/** "either X% or Y% off" — the possible outcomes, best last, for the teaser line. */
function outcomesHint(): string {
  const rates = scratchOutcomes()
    .map((o) => Math.round(o.discount * 100))
    .sort((a, b) => a - b)
  if (rates.length === 0) return ''
  if (rates.length === 1) return `${rates[0]}% off`
  return `${rates.slice(0, -1).join('%, ')}% or ${rates[rates.length - 1]}% off`
}

export function ScratchToReveal({ monthlyTotal, revealed, onReveal }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scratchingRef = useRef(false)
  const moveCountRef = useRef(0)
  const doneRef = useRef(false)
  // Roll the prize once, up front, so the surface underneath is stable while the
  // member scratches. It's only committed (via onReveal) once enough is cleared.
  const [prize] = useState(() => rollScratchDiscount())
  const [done, setDone] = useState(false)

  const isRevealed = revealed != null || done
  const shownRate = revealed ?? prize
  const firstMonth = Math.round(monthlyTotal * (1 - shownRate) * 100) / 100
  const pctOff = Math.round(shownRate * 100)

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    setDone(true)
    onReveal(prize)
  }, [onReveal, prize])

  // Paint the scratch coating once the canvas is on screen (and sized to it).
  useEffect(() => {
    if (isRevealed) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(rect.width * dpr))
    canvas.height = Math.max(1, Math.round(rect.height * dpr))
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = rect.height
    const grad = ctx.createLinearGradient(0, 0, w, h)
    grad.addColorStop(0, '#2b2b31')
    grad.addColorStop(0.5, '#3a3a42')
    grad.addColorStop(1, '#26262b')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    // Canvas font strings don't support CSS var(), so use a concrete stack.
    ctx.fillStyle = 'rgba(0, 212, 255, 0.85)'
    ctx.font = '700 13px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('✦  SCRATCH TO REVEAL  ✦', w / 2, h / 2 - 8)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.font = '600 10px system-ui, -apple-system, sans-serif'
    ctx.fillText('your first-month discount', w / 2, h / 2 + 10)
  }, [isRevealed])

  const scratchedFraction = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let clear = 0
    // Sample every 32nd pixel's alpha — plenty accurate, far cheaper than all.
    for (let i = 3; i < data.length; i += 32 * 4) {
      if (data[i] === 0) clear += 1
    }
    const sampled = Math.ceil(data.length / (32 * 4))
    return sampled > 0 ? clear / sampled : 0
  }, [])

  const eraseAt = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas || doneRef.current) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const rect = canvas.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(x, y, BRUSH_RADIUS, 0, Math.PI * 2)
      ctx.fill()

      // Throttle the (relatively pricey) fraction check to every few moves.
      moveCountRef.current += 1
      if (moveCountRef.current % 6 === 0 && scratchedFraction(ctx, canvas) >= REVEAL_THRESHOLD) {
        finish()
      }
    },
    [finish, scratchedFraction],
  )

  if (isRevealed) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] overflow-hidden mb-4">
        <div
          className="p-5 flex items-center justify-between gap-3"
          style={{ background: 'color-mix(in srgb, var(--color-accent) 7%, transparent)' }}
        >
          <div className="min-w-0">
            <p
              className="text-[10px] font-bold tracking-widest uppercase mb-1"
              style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}
            >
              You revealed
            </p>
            <p
              className="text-2xl font-black leading-none"
              style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}
            >
              {pctOff}% off
            </p>
            <p className="text-[11px] text-[var(--color-muted)] mt-1">your first month</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <span className="text-[11px] text-[var(--color-muted)] line-through block">
              {formatGBP(monthlyTotal)}
            </span>
            <span
              className="text-lg font-black"
              style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
            >
              {formatGBP(firstMonth)}
            </span>
          </div>
        </div>
      </div>
    )
  }

  const hint = outcomesHint()

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] overflow-hidden mb-4">
      <div className="p-5">
        <p
          className="text-[10px] font-bold tracking-widest uppercase mb-1"
          style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}
        >
          Your first-month reward
        </p>
        <p className="text-xs text-[var(--color-muted)] mb-4 leading-relaxed">
          {hint
            ? `Scratch the card to reveal your discount — ${hint}. It's applied to your first month.`
            : 'Scratch the card to reveal your first-month discount.'}
        </p>

        <div className="relative rounded-xl overflow-hidden select-none" style={{ height: 96 }}>
          {/* Prize sits underneath the scratch coating. */}
          <div
            className="absolute inset-0 flex items-center justify-center gap-3"
            style={{ background: 'color-mix(in srgb, var(--color-accent) 10%, var(--color-surface))' }}
            aria-hidden={!done}
          >
            <div className="text-center">
              <p
                className="text-3xl font-black leading-none"
                style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}
              >
                {pctOff}% OFF
              </p>
              <p className="text-[11px] text-[var(--color-muted)] mt-1.5">
                first month · {formatGBP(firstMonth)}
              </p>
            </div>
          </div>

          {/* The scratch coating. */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full touch-none cursor-grab active:cursor-grabbing"
            style={{ width: '100%', height: '100%' }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              scratchingRef.current = true
              eraseAt(e.clientX, e.clientY)
            }}
            onPointerMove={(e) => {
              if (scratchingRef.current) eraseAt(e.clientX, e.clientY)
            }}
            onPointerUp={() => {
              scratchingRef.current = false
            }}
            onPointerCancel={() => {
              scratchingRef.current = false
            }}
          />
        </div>

        {/* Accessible / no-scratch fallback. */}
        <button
          onClick={finish}
          className="w-full mt-3 py-2 rounded-xl text-[11px] font-semibold active:scale-[0.99] transition-transform"
          style={{ color: 'var(--color-muted)', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          Or tap here to reveal
        </button>
      </div>
    </div>
  )
}

/** Whether the scratch-to-reveal card should be offered (config gate, re-exported for callers). */
export function scratchRevealAvailable(): boolean {
  return scratchOutcomes(getPricingConfig()).length > 0
}
