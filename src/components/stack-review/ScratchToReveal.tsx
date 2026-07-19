'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import {
  formatGBP,
  getPricingConfig,
  rollScratchDiscount,
  scratchOutcomes,
} from '@/lib/stack-blueprint/pricing'

const ACCENT = '#00D4FF'
/**
 * Fraction of the coating that must be cleared before it auto-reveals. Kept
 * deliberately low: a card that LOOKS scratched must reveal. The remainder is
 * dissolved away for the user rather than making them chase the corners.
 */
const REVEAL_THRESHOLD = 0.38
/** Radius (px) of the brush that erases the coating as you drag. */
const BRUSH_RADIUS = 24
/** How long the leftover foil takes to dissolve once the reveal triggers. */
const DISSOLVE_MS = 550

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
  // 'scratching' → 'dissolving' (foil melts away) → 'done' (settled).
  const [phase, setPhase] = useState<'scratching' | 'dissolving' | 'done'>('scratching')
  // Arrived with the prize already claimed (a previous visit) → compact summary.
  const [claimedOnMount] = useState(revealed != null)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  const shownRate = revealed ?? prize
  const firstMonth = Math.round(monthlyTotal * (1 - shownRate) * 100) / 100
  const pctOff = Math.round(shownRate * 100)

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    setPhase('dissolving')
    if (!reduced) {
      confetti({
        particleCount: 70,
        spread: 70,
        startVelocity: 28,
        origin: { y: 0.55 },
        colors: [ACCENT, '#ffffff'],
        disableForReducedMotion: true,
      })
    }
    // Commit to the store once the foil has melted, so the compact state never
    // snaps in mid-dissolve.
    setTimeout(() => { setPhase('done'); onReveal(prize) }, reduced ? 0 : DISSOLVE_MS)
  }, [onReveal, prize, reduced])

  // Paint the foil once the canvas is on screen (and sized to it).
  useEffect(() => {
    if (claimedOnMount) return
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

    // Brushed-metal foil: a deep diagonal gradient…
    const grad = ctx.createLinearGradient(0, 0, w, h)
    grad.addColorStop(0, '#26262c')
    grad.addColorStop(0.35, '#3d3d46')
    grad.addColorStop(0.5, '#4a4a54')
    grad.addColorStop(0.65, '#3d3d46')
    grad.addColorStop(1, '#222227')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    // …with fine diagonal sheen streaks…
    ctx.save()
    ctx.globalAlpha = 0.05
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1
    for (let x = -h; x < w; x += 7) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x + h, h)
      ctx.stroke()
    }
    ctx.restore()

    // …a soft accent glint sweeping the top edge…
    const glint = ctx.createLinearGradient(0, 0, w, 0)
    glint.addColorStop(0, 'rgba(0,212,255,0)')
    glint.addColorStop(0.5, 'rgba(0,212,255,0.14)')
    glint.addColorStop(1, 'rgba(0,212,255,0)')
    ctx.fillStyle = glint
    ctx.fillRect(0, 0, w, 14)

    // …and a few scattered sparkles.
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    const sparkles: Array<[number, number]> = [
      [w * 0.14, h * 0.3], [w * 0.82, h * 0.22], [w * 0.68, h * 0.74], [w * 0.28, h * 0.78], [w * 0.9, h * 0.6],
    ]
    for (const [sx, sy] of sparkles) {
      ctx.beginPath()
      ctx.arc(sx, sy, 1.1, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.fillStyle = 'rgba(0, 212, 255, 0.9)'
    ctx.font = '700 13px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('✦   S C R A T C H   T O   R E V E A L   ✦', w / 2, h / 2 - 8)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.font = '600 10px system-ui, -apple-system, sans-serif'
    ctx.fillText('your first-month discount', w / 2, h / 2 + 10)
  }, [claimedOnMount])

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

  /** Reveal if enough is cleared. Cheap enough to run on every stroke end. */
  const maybeFinish = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || doneRef.current) return
    if (scratchedFraction(ctx, canvas) >= REVEAL_THRESHOLD) finish()
  }, [finish, scratchedFraction])

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

      // Throttle the (relatively pricey) fraction check while dragging; the
      // pointer-up check below is the guarantee it can't get stuck near-done.
      moveCountRef.current += 1
      if (moveCountRef.current % 4 === 0) maybeFinish()
    },
    [maybeFinish],
  )

  // A previous visit already claimed it — the settled summary card.
  if (claimedOnMount) {
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
  const isSettled = phase !== 'scratching'

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] overflow-hidden mb-4">
      <div className="p-5">
        <p
          className="text-[10px] font-bold tracking-widest uppercase mb-1"
          style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}
        >
          {isSettled ? 'You revealed' : 'Your first-month reward'}
        </p>
        <p className="text-xs text-[var(--color-muted)] mb-4 leading-relaxed">
          {isSettled
            ? 'Applied to your first month automatically.'
            : hint
              ? `Scratch the card to reveal your discount — ${hint}. It's applied to your first month.`
              : 'Scratch the card to reveal your first-month discount.'}
        </p>

        <div className="relative rounded-xl overflow-hidden select-none" style={{ height: 96 }}>
          {/* Prize sits underneath the foil; pops as the foil dissolves. */}
          <div
            className="absolute inset-0 flex items-center justify-center gap-3"
            style={{
              background: `radial-gradient(90% 120% at 50% 0%, color-mix(in srgb, ${ACCENT} 16%, transparent), transparent 70%), color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))`,
              transform: isSettled ? 'scale(1)' : 'scale(0.96)',
              transition: reduced ? 'none' : `transform ${DISSOLVE_MS}ms cubic-bezier(0.22,1,0.36,1)`,
            }}
            aria-hidden={!isSettled}
          >
            <div className="text-center">
              <p
                className="text-3xl font-black leading-none"
                style={{
                  color: ACCENT,
                  fontFamily: 'var(--font-display)',
                  textShadow: isSettled ? `0 0 22px color-mix(in srgb, ${ACCENT} 55%, transparent)` : 'none',
                }}
              >
                {pctOff}% OFF
              </p>
              <p className="text-[11px] text-[var(--color-muted)] mt-1.5">
                first month · {formatGBP(firstMonth)}
              </p>
            </div>
          </div>

          {/* The foil. Fades away as one piece the moment enough is cleared —
              the user is never left chasing the last corners. */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full touch-none cursor-grab active:cursor-grabbing"
            style={{
              width: '100%',
              height: '100%',
              opacity: isSettled ? 0 : 1,
              pointerEvents: isSettled ? 'none' : 'auto',
              transition: reduced ? 'none' : `opacity ${DISSOLVE_MS}ms ease`,
            }}
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
              maybeFinish()
            }}
            onPointerCancel={() => {
              scratchingRef.current = false
              maybeFinish()
            }}
          />
        </div>

        {/* Accessible / no-scratch fallback — quiet, not a competing button. */}
        {!isSettled && (
          <button
            onClick={finish}
            className="w-full mt-3 text-[11px] font-semibold text-center underline underline-offset-2 active:opacity-60 transition-opacity"
            style={{ color: 'var(--color-muted)' }}
          >
            Prefer a tap? Reveal it
          </button>
        )}
      </div>
    </div>
  )
}

/** Whether the scratch-to-reveal card should be offered (config gate, re-exported for callers). */
export function scratchRevealAvailable(): boolean {
  return scratchOutcomes(getPricingConfig()).length > 0
}
