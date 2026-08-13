'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReceiptData, ReceiptItem, ReceiptRow } from '@/lib/receipt/types'

/**
 * A thermal receipt printing itself at the end of a payment journey.
 *
 * The paper *moves*. Two things happen together at the same constant speed: the
 * clip below the printer's mouth grows, and the paper inside it translates down
 * by exactly the same amount, so its bottom edge stays at the clip's bottom
 * edge and leads the way out of the slot. The receipt therefore emerges
 * bottom-first — footer, then barcode, then the totals, with the masthead
 * arriving last as the sheet finishes clearing the mouth — and every line
 * already printed slides visibly downward as more paper feeds behind it.
 *
 * The distinction matters because the obvious implementation (grow the clip,
 * leave the paper still) reveals the receipt top-first with nothing in motion,
 * which reads as a wipe over a static image rather than as a mechanism.
 * Everything else — the housing, the LED, the torn edge — is decoration around
 * those two synchronised numbers.
 *
 * Two things it deliberately does NOT do:
 *
 *  - **Animate its own arrival.** The caller decides when a receipt exists;
 *    this component prints what it is given. The confirmation screen only ever
 *    gives it one after the server has verified the payment (OC-F-002).
 *  - **Hide content while it feeds.** The paper is in the DOM at full height
 *    throughout, so a screen reader gets the whole receipt at once and the
 *    printing is purely visual. With `prefers-reduced-motion` there is no feed
 *    at all — the receipt is simply there.
 */

/** Paper feed speed, px/sec. Slow enough to read as mechanical, not as a wipe. */
const FEED_PX_PER_SEC = 620
/** Longest a receipt may take to print, however long it is. */
const MAX_FEED_MS = 2600
/** Feed granularity: paper advances in whole steps, like a stepper motor. */
const STEP_PX = 3

/**
 * `useLayoutEffect` on the server is a warning and nothing else; this component
 * is client-rendered but still prerendered, so it takes the effect that exists.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    // Guarded: an environment without `matchMedia` has no stated preference,
    // and a missing API is not a reason to fail rendering a receipt.
    if (typeof window.matchMedia !== 'function') return
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])
  return reduced
}

/**
 * Bar widths derived from the reference itself, so the same order always prints
 * the same barcode and a different one never prints an identical-looking bar.
 * Decorative — the readable reference is printed underneath it.
 */
function barcodeBars(seed: string): number[] {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  const bars: number[] = []
  for (let i = 0; i < 44; i++) {
    hash = (hash * 1103515245 + 12345) >>> 0
    bars.push(1 + ((hash >>> 8) % 3))
  }
  return bars
}

function Rule({ double = false }: { double?: boolean }) {
  return (
    <div
      aria-hidden
      className="my-2.5"
      style={{
        borderTop: `1px ${double ? 'double' : 'dashed'} rgba(28,24,20,0.38)`,
        borderTopWidth: double ? 3 : 1,
      }}
    />
  )
}

function toneColour(tone: ReceiptRow['tone']): string {
  if (tone === 'saving') return '#0f6b4f'
  if (tone === 'muted') return 'rgba(28,24,20,0.55)'
  return '#1c1814'
}

/** A label and a value, joined by the dot leader every receipt in the world uses. */
function Leader({ row, bold = false }: { row: ReceiptRow; bold?: boolean }) {
  return (
    <div className="flex items-baseline gap-1 text-[11.5px] leading-[1.5]">
      <span style={{ color: toneColour(row.tone) }}>{row.label}</span>
      <span
        aria-hidden
        className="flex-1 translate-y-[-3px]"
        style={{ borderBottom: '1px dotted rgba(28,24,20,0.3)' }}
      />
      <span
        className="whitespace-nowrap"
        style={{
          color: toneColour(row.tone),
          fontWeight: bold ? 700 : 500,
          textDecoration: row.strike ? 'line-through' : 'none',
        }}
      >
        {row.value}
      </span>
    </div>
  )
}

function ItemLine({ item }: { item: ReceiptItem }) {
  return (
    <div className="flex items-start gap-2 text-[11.5px] leading-[1.45] py-[3px]">
      <span className="w-6 flex-shrink-0 tabular-nums" style={{ color: 'rgba(28,24,20,0.6)' }}>
        {item.qty}×
      </span>
      <span className="flex-1 min-w-0" style={{ color: '#1c1814' }}>
        {item.name}
        {item.note && (
          <span className="block text-[10px]" style={{ color: 'rgba(28,24,20,0.5)' }}>
            {item.note}
          </span>
        )}
      </span>
      {item.amount && (
        <span className="whitespace-nowrap font-semibold tabular-nums" style={{ color: '#1c1814' }}>
          {item.amount}
        </span>
      )}
    </div>
  )
}

/** The housing: a slab with a mouth, a status LED and the rollers either side. */
function PrinterHousing({ printing }: { printing: boolean }) {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[380px]">
      <div
        className="rounded-t-2xl rounded-b-md px-4 pt-3 pb-1.5"
        style={{
          background: 'linear-gradient(180deg, #33333a 0%, #202026 62%, #17171b 100%)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.09) inset, 0 12px 30px -18px rgba(0,0,0,0.9)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div className="flex items-center justify-between mb-2.5">
          <span
            className="text-[8px] font-bold tracking-[0.28em] uppercase"
            style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-display)' }}
          >
            CHRGD · Thermal 80mm
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full${printing ? ' receipt-led-on' : ''}`}
              style={{ background: 'var(--color-accent)', boxShadow: '0 0 6px var(--color-accent)' }}
            />
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.16)' }} />
          </span>
        </div>

        {/* The mouth. The paper appears from under its lower lip. */}
        <div
          className="h-2.5 rounded-full"
          style={{
            background: 'linear-gradient(180deg, #0a0a0c 0%, #000 55%, #26262c 100%)',
            boxShadow: '0 2px 5px rgba(0,0,0,0.7) inset',
          }}
        />
      </div>
    </div>
  )
}

export function ReceiptPrinter({ receipt, className }: { receipt: ReceiptData; className?: string }) {
  const paperRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  /** `null` until the paper has been measured; `0` where there is no layout. */
  const [paperHeight, setPaperHeight] = useState<number | null>(null)
  const [fed, setFed] = useState(0)
  const [done, setDone] = useState(false)

  // Measure before paint so the first painted frame is already clipped —
  // measuring in an effect after paint would flash the whole receipt.
  useIsomorphicLayoutEffect(() => {
    const el = paperRef.current
    if (!el) return
    // `offsetHeight`, not the bounding rect: the paper carries a translate for
    // the whole of the feed, and a rect measured through a transform would feed
    // its own measurement back into itself.
    const measure = () => setPaperHeight(el.offsetHeight)
    measure()
    // Fonts and images settle after mount; the clip has to follow the paper or
    // it crops the last line off a receipt that grew.
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [receipt])

  useEffect(() => {
    if (paperHeight === null) return
    // No measurable layout (a test environment, or a hidden ancestor) and
    // reduced motion both end the same way: the whole receipt, no feed. The
    // animation is the flourish; the receipt is the point.
    if (reduced || paperHeight === 0) {
      setFed(paperHeight)
      setDone(true)
      return
    }
    const duration = Math.min(MAX_FEED_MS, (paperHeight / FEED_PX_PER_SEC) * 1000)
    const start = performance.now()
    let frame = 0
    const tick = (t: number) => {
      const progress = Math.min(1, (t - start) / duration)
      // Quantised to whole steps: paper leaves a printer in discrete advances,
      // and a perfectly smooth reveal reads as a CSS wipe rather than a feed.
      setFed(Math.min(paperHeight, Math.ceil((progress * paperHeight) / STEP_PX) * STEP_PX))
      if (progress < 1) frame = requestAnimationFrame(tick)
      else setDone(true)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [paperHeight, reduced])

  const printing = paperHeight !== null && paperHeight > 0 && !done

  return (
    <div className={className}>
      <PrinterHousing printing={printing} />

      {/* The clip. Its height is the whole trick. */}
      <div
        className="relative mx-auto w-full max-w-[380px] overflow-hidden"
        style={{
          height: paperHeight ? fed : undefined,
          // Before the first measurement the paper must be laid out but unseen,
          // otherwise it flashes at full height on the first frame.
          visibility: paperHeight === null ? 'hidden' : 'visible',
          transition: 'none',
        }}
      >
        <div
          ref={paperRef}
          className="relative px-6 pt-5 pb-8 mx-auto"
          style={{
            // The sheet rides down with the clip's bottom edge: at zero feed it
            // sits entirely above the mouth, still inside the printer.
            transform: paperHeight ? `translateY(${fed - paperHeight}px)` : undefined,
            width: 'min(100%, 340px)',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
            color: '#1c1814',
            background:
              'linear-gradient(180deg, #fbf9f3 0%, #f5f1e6 100%)',
            // Zigzag tear along the bottom edge.
            WebkitMask:
              'conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 14px 100% repeat-x',
            mask:
              'conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 14px 100% repeat-x',
            filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.35))',
          }}
        >
          {/* Masthead */}
          <div className="text-center">
            <p className="text-[17px] font-black tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              {receipt.merchant.name}
            </p>
            <p className="text-[9.5px] uppercase tracking-[0.2em] mt-0.5" style={{ color: 'rgba(28,24,20,0.55)' }}>
              {receipt.merchant.strapline}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(28,24,20,0.5)' }}>
              {receipt.merchant.site}
            </p>
          </div>

          <Rule />

          <p className="text-center text-[10px] font-bold uppercase tracking-[0.28em]">{receipt.docTitle}</p>

          <Rule />

          {receipt.meta.length > 0 && (
            <div className="space-y-0.5">
              {receipt.meta.map((row) => (
                <Leader key={row.label} row={row} />
              ))}
            </div>
          )}

          {receipt.shipTo.length > 0 && (
            <>
              <Rule />
              <p className="text-[9px] uppercase tracking-[0.18em] mb-1" style={{ color: 'rgba(28,24,20,0.5)' }}>
                Deliver to
              </p>
              <address className="not-italic text-[11px] leading-[1.5]">
                {receipt.shipTo.map((line, i) => (
                  <span key={i} className="block">
                    {line}
                  </span>
                ))}
              </address>
            </>
          )}

          {receipt.items.length > 0 && (
            <>
              <Rule />
              {/* No amount column on a flat plan, where the lines are a
                  schedule and the money is all in the block below. */}
              <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.18em] mb-1" style={{ color: 'rgba(28,24,20,0.5)' }}>
                <span>Qty · Item</span>
                {receipt.items.some((item) => item.amount) && <span>Amount</span>}
              </div>
              <div>
                {receipt.items.map((item, i) => (
                  <ItemLine key={`${item.name}-${i}`} item={item} />
                ))}
              </div>
            </>
          )}

          {receipt.adjustments.length > 0 && (
            <>
              <Rule />
              <div className="space-y-0.5">
                {receipt.adjustments.map((row) => (
                  <Leader key={row.label} row={row} />
                ))}
              </div>
            </>
          )}

          {receipt.total && (
            <>
              <Rule double />
              <div className="flex items-baseline justify-between text-[13px] font-black uppercase tracking-wide">
                <span>{receipt.total.label}</span>
                <span className="tabular-nums">{receipt.total.value}</span>
              </div>
            </>
          )}

          {receipt.charge.length > 0 && (
            <>
              <Rule />
              <div className="space-y-0.5">
                {receipt.charge.map((row) => (
                  <Leader key={row.label} row={row} />
                ))}
              </div>
            </>
          )}

          {receipt.stamp && (
            <>
              <Rule />
              {/* Struck at an angle, as a till stamps one. It says only what the
                  builder proved: approved, trial started, or demo. */}
              <p
                className="text-center text-[12px] font-black uppercase tracking-[0.16em] mx-auto px-3 py-1.5"
                style={{
                  color: '#1c1814',
                  border: '2px solid rgba(28,24,20,0.6)',
                  borderRadius: 4,
                  transform: 'rotate(-1.6deg)',
                  width: 'fit-content',
                  opacity: 0.82,
                }}
              >
                ✱ {receipt.stamp} ✱
              </p>
            </>
          )}

          {receipt.notes.length > 0 && (
            <>
              <Rule />
              <div className="space-y-1.5">
                {receipt.notes.map((note, i) => (
                  <p key={i} className="text-[10px] leading-[1.5]" style={{ color: 'rgba(28,24,20,0.62)' }}>
                    {note}
                  </p>
                ))}
              </div>
            </>
          )}

          {receipt.reference && (
            <>
              <Rule />
              <div className="flex items-end justify-center gap-[2px] h-10" aria-hidden>
                {barcodeBars(receipt.reference).map((w, i) => (
                  <span
                    key={i}
                    style={{
                      width: w,
                      height: '100%',
                      background: i % 2 === 0 ? '#1c1814' : 'transparent',
                    }}
                  />
                ))}
              </div>
              {/* Spelled out for a screen reader, so the reference is read as
                  a reference rather than as one run-together word — it is the
                  thing a customer quotes back to support (OC-NFR-010). The
                  meta block above still reads it normally. */}
              <p
                className="text-center text-[10px] tracking-[0.3em] mt-1"
                style={{ color: 'rgba(28,24,20,0.7)' }}
                aria-label={`Reference ${receipt.reference.split('').join(' ')}`}
              >
                {receipt.reference}
              </p>
            </>
          )}

          <p className="text-center text-[10px] uppercase tracking-[0.2em] mt-3" style={{ color: 'rgba(28,24,20,0.6)' }}>
            {receipt.footer}
          </p>
        </div>
      </div>
    </div>
  )
}
