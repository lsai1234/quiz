'use client'

import { useEffect, useRef } from 'react'
import type { Trace } from '@/lib/consult/trace'
import { TRACE_COPY } from '@/lib/consult/trace-copy'

/**
 * Trace it back (plan Phase 8): the path from a product back to the answers
 * that put it there, drawn as a tree: the product, the steps (a pattern, a
 * goal or a need the claims map backs, each with its claim; or "From your
 * answers"), then their answers as they gave them. Thicker lines counted for
 * more. The lines draw in from the product down; under reduced motion they're
 * simply there.
 */
export function TraceView({ trace, product }: { trace: Trace; product: string }) {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el || typeof el.animate !== 'function' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    // From the product down: each wire, then what it leads to, in reading order.
    el.querySelectorAll<HTMLElement>('[data-wire], [data-node]').forEach((node, i) => {
      const wire = node.hasAttribute('data-wire')
      node.animate(
        wire ? [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }] : [{ opacity: 0, transform: 'translateX(-6px)' }, { opacity: 1, transform: 'none' }],
        { duration: 260, delay: i * 70, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' },
      )
    })
  }, [trace])

  return (
    <div ref={root} data-trace={trace.productId} className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
      <p data-node style={{ fontSize: 'var(--text-body)', fontWeight: 700, color: 'var(--ink-1)' }}>
        {product}
      </p>
      <ol aria-label={TRACE_COPY.heading} className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
        {trace.steps.map((step, i) => (
          <li key={step.label} data-step={step.kind} className="relative" style={{ paddingLeft: 'var(--space-6)' }}>
            <Wire weight={step.weight} last={i === trace.steps.length - 1} strong />
            <div data-node>
              <p style={{ fontSize: 'var(--text-body)', fontWeight: 700, color: step.kind === 'answers' ? 'var(--ink-2)' : 'var(--accent)' }}>{step.label}</p>
              {step.claim && (
                <p style={{ marginTop: 'var(--space-1)', fontSize: 'var(--text-meta)', color: 'var(--ink-2)' }}>
                  <span className="sr-only">{TRACE_COPY.claimLabel}: </span>“{step.claim}”
                </p>
              )}
            </div>
            {step.answers.length > 0 && (
              <ul className="flex flex-col" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                {step.answers.map((a, j) => (
                  <li key={a.text} data-answer={Math.round(a.weight * 100)} className="relative" style={{ paddingLeft: 'var(--space-5)' }}>
                    <Wire weight={a.weight} last={j === step.answers.length - 1} />
                    <p data-node style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>
                      “{a.text}”
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>{TRACE_COPY.key}</p>
    </div>
  )
}

/**
 * The elbow from the line above into this row, as thick as the row counted
 * for, and the line carrying on down to the next row unless it's the last.
 */
function Wire({ weight, last, strong = false }: { weight: number; last: boolean; strong?: boolean }) {
  const thickness = `calc(var(--space-1) * ${(strong ? 0.5 : 0.35) + weight * (strong ? 1.25 : 0.9)})`
  const left = strong ? 'var(--space-2)' : 'var(--space-1)'
  return (
    <>
      <span
        aria-hidden
        data-wire
        className="absolute"
        style={{ left, top: `calc(var(--space-1) * -2)`, width: 'var(--space-3)', height: 'calc(var(--space-4) + var(--space-1))', borderLeft: `${thickness} solid var(--accent)`, borderBottom: `${thickness} solid var(--accent)`, borderBottomLeftRadius: 'var(--radius-chip)', opacity: 0.4 + weight * 0.6, transformOrigin: 'top' }}
      />
      {!last && <span aria-hidden className="absolute" style={{ left, top: 'var(--space-4)', bottom: 'calc(var(--space-3) * -1)', borderLeft: `calc(var(--space-1) * 0.5) solid var(--accent-line)` }} />}
    </>
  )
}
