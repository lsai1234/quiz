'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { useQuizStore } from '@/lib/store'

// Maximum capsules for fill-level calculation (visual cap)
const MAX_CAPSULES = 12

// Colors for poured-out capsule animation
const POUR_COLORS = ['#00D4FF', '#80E8FF', '#00AACC', '#00D4FF', '#80E8FF', '#00AACC']

interface Props {
  act: number
}

export function CollectorBottle({ act }: Props) {
  const { collectorCapsules, collectorPouring } = useQuizStore()
  const bottleRef = useRef<HTMLDivElement>(null)
  const prevCapsules = useRef(collectorCapsules)
  const fillRef = useRef<SVGRectElement>(null)

  const visible = act >= 2

  // Animate fill-line when capsules change + squash/stretch bounce on new arrival
  useEffect(() => {
    if (!bottleRef.current || !fillRef.current) return

    const fillFraction = Math.min(collectorCapsules / MAX_CAPSULES, 1)
    const fillHeight = fillFraction * 56  // 56 = interior bottle height in SVG units

    gsap.to(fillRef.current, {
      attr: { height: fillHeight, y: 90 - fillHeight },
      duration: 0.35,
      ease: 'power2.out',
    })

    // Squash/stretch on new capsule(s) arriving
    if (collectorCapsules > prevCapsules.current) {
      gsap.fromTo(
        bottleRef.current,
        { scaleX: 1, scaleY: 1 },
        {
          keyframes: [
            { scaleX: 1.18, scaleY: 0.82, duration: 0.1, ease: 'power2.in' },
            { scaleX: 0.92, scaleY: 1.08, duration: 0.12, ease: 'power2.out' },
            { scaleX: 1, scaleY: 1, duration: 0.15, ease: 'power2.inOut' },
          ],
          overwrite: true,
        },
      )
    }

    prevCapsules.current = collectorCapsules
  }, [collectorCapsules])

  // Appear/disappear with act
  useEffect(() => {
    const el = bottleRef.current
    if (!el) return
    if (visible) {
      gsap.fromTo(el, { opacity: 0, scale: 0.5, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: 'back.out(1.8)' })
    } else {
      gsap.to(el, { opacity: 0, scale: 0.5, duration: 0.3, ease: 'power2.in' })
    }
  }, [visible])

  // Pour-out animation when transitioning to Act4
  useEffect(() => {
    if (!collectorPouring || !bottleRef.current) return

    const bottle = bottleRef.current
    const bottleRect = bottle.getBoundingClientRect()

    // Move to center-top, scale up, tip
    const toX = window.innerWidth / 2 - bottleRect.left - bottleRect.width / 2
    const toY = window.innerHeight * 0.18 - bottleRect.top
    const pourTl = gsap.timeline()

    pourTl
      .to(bottle, { x: toX, y: toY, scale: 2.2, duration: 0.45, ease: 'power2.inOut' })
      .to(bottle, { rotation: -30, duration: 0.3, ease: 'power2.out' })

    // Spawn capsule elements that fall out
    const capsuleCount = Math.max(collectorCapsules, 4)
    const spawnedEls: HTMLDivElement[] = []
    POUR_COLORS.slice(0, Math.min(capsuleCount, 6)).forEach((color, i) => {
      const el = document.createElement('div')
      Object.assign(el.style, {
        position: 'fixed',
        width: '8px',
        height: '20px',
        borderRadius: '4px',
        background: color,
        boxShadow: `0 0 8px ${color}88`,
        left: `${window.innerWidth / 2 - 4}px`,
        top: `${window.innerHeight * 0.18 + 20}px`,
        pointerEvents: 'none',
        zIndex: '9998',
        opacity: '0',
      })
      document.body.appendChild(el)
      spawnedEls.push(el)

      pourTl.to(el, {
        opacity: 1,
        y: 100 + i * 30 + Math.random() * 40,
        x: (Math.random() - 0.5) * 80,
        rotation: Math.random() * 360,
        duration: 0.5,
        ease: 'bounce.out',
        delay: 0.6 + i * 0.08,
      }, 0)
      pourTl.to(el, { opacity: 0, duration: 0.3, delay: 0.9 + i * 0.06 }, 0)
    })

    // Fade out entire bottle
    pourTl.to(bottle, { opacity: 0, scale: 0, duration: 0.4, ease: 'power2.in' }, 1.2)

    pourTl.eventCallback('onComplete', () => {
      spawnedEls.forEach(el => el.remove())
    })
  }, [collectorPouring]) // eslint-disable-line react-hooks/exhaustive-deps

  const fillFraction = Math.min(collectorCapsules / MAX_CAPSULES, 1)
  const fillHeight = fillFraction * 56

  return (
    <div
      ref={bottleRef}
      data-collector-bottle
      className="fixed z-50 pointer-events-none"
      style={{
        right: 20,
        bottom: 'max(24px, env(safe-area-inset-bottom, 24px))',
        width: 48,
        opacity: 0,
        transformOrigin: 'center bottom',
      }}
    >
      <svg
        viewBox="0 0 48 96"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        <defs>
          {/* Clip path matches bottle interior */}
          <clipPath id="bottle-fill-clip">
            <path d="M14 32 Q8 34 8 44 L8 84 Q8 92 16 92 L32 92 Q40 92 40 84 L40 44 Q40 34 34 32 Z" />
          </clipPath>
        </defs>

        {/* Bottle neck */}
        <rect x="18" y="8" width="12" height="10" rx="2"
          fill="none" stroke="#00D4FF" strokeWidth="1.5" opacity="0.7" />

        {/* Neck opening */}
        <rect x="18" y="6" width="12" height="4" rx="1"
          fill="#00D4FF" opacity="0.2" />

        {/* Shoulder taper */}
        <path d="M12 30 L18 18 L30 18 L36 30 Z"
          fill="none" stroke="#00D4FF" strokeWidth="1.5" strokeLinejoin="round" opacity="0.7" />

        {/* Bottle body outline */}
        <path d="M14 32 Q8 34 8 44 L8 84 Q8 92 16 92 L32 92 Q40 92 40 84 L40 44 Q40 34 34 32 Z"
          fill="none" stroke="#00D4FF" strokeWidth="1.5" opacity="0.7" />

        {/* Fill level — GSAP animates height/y */}
        <rect
          ref={fillRef}
          x="8"
          y={90 - fillHeight}
          width="32"
          height={fillHeight}
          fill="#00D4FF"
          opacity="0.35"
          clipPath="url(#bottle-fill-clip)"
        />

        {/* Fill top sheen */}
        {fillHeight > 4 && (
          <rect
            x="8"
            y={90 - fillHeight}
            width="32"
            height="2"
            fill="#80E8FF"
            opacity="0.6"
            clipPath="url(#bottle-fill-clip)"
          />
        )}

        {/* Capsule count label */}
        {collectorCapsules > 0 && (
          <text
            x="24"
            y="62"
            textAnchor="middle"
            fontSize="9"
            fontWeight="bold"
            fill="#00D4FF"
            opacity="0.9"
            style={{ fontFamily: 'var(--font-display, monospace)' }}
          >
            {collectorCapsules}
          </text>
        )}
      </svg>
    </div>
  )
}
