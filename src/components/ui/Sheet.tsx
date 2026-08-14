'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { ACCENT, EASE, GLASS } from '@/lib/ui/tokens'
import { Eyebrow } from './Eyebrow'
import { IconButton } from './IconButton'

/**
 * The bottom sheet.
 *
 * Six hub components each carry their own copy of this — portal, body-scroll
 * lock, Escape listener, grab handle, header, close button — and the copies have
 * already drifted: `maxHeight` is `90dvh` in two and `92dvh` in three, the
 * z-index is 50 in five and 60 in one, and none of them animates, traps focus,
 * or gives focus back when it closes. A member on a keyboard can tab straight
 * out of an open sheet into the page behind it.
 *
 * Mounting is opening. That matches how the hub already works — parents render
 * `{showAdd && <AddProductSheet …/>}` — so adopting this needs no state changes.
 *
 * ── On closing ───────────────────────────────────────────────────────────────
 * Every dismissal the member initiates (backdrop, Escape, the close button) runs
 * the exit animation first and calls `onClose` when it finishes, so the sheet
 * slides away instead of vanishing. A parent that unmounts the sheet for its own
 * reasons still gets an instant close; that is the right trade, because the
 * alternative is a sheet that lingers after the thing it was editing is gone.
 */

const EXIT_MS = 180

/**
 * Lets `SheetHeader` close the sheet through the exit animation without every
 * caller having to thread the handler down twice (once for the sheet, once for
 * its own close button) and keep them in step.
 */
const SheetCloseContext = createContext<(() => void) | null>(null)

export interface SheetProps {
  children: ReactNode
  onClose: () => void
  /**
   * `over` layers above an already-open sheet — the confirm-your-change summary
   * sitting on top of the sheet that raised it. Two levels is the limit; a third
   * means the flow is wrong.
   */
  layer?: 'base' | 'over'
  /** Accessible name, when the sheet has no `SheetHeader` to label it. */
  label?: string
  className?: string
}

export function Sheet({ children, onClose, layer = 'base', label, className }: SheetProps) {
  const [mounted, setMounted] = useState(false)
  const [closing, setClosing] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reduced = useReducedMotion()

  useEffect(() => { setMounted(true) }, [])

  /** Animate out, then hand back to the parent. */
  const requestClose = useCallback(() => {
    if (closeTimer.current) return
    if (reduced) { onClose(); return }
    setClosing(true)
    closeTimer.current = setTimeout(onClose, EXIT_MS)
  }, [onClose, reduced])

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])

  // Body scroll lock. Restores the previous value rather than clearing it, so
  // two stacked sheets don't unlock the page when the upper one closes.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  /**
   * Focus: move into the sheet on open, keep Tab inside it, and give focus back
   * to whatever opened it on close. Without the last part, dismissing a sheet
   * drops a keyboard user at the top of the document.
   */
  useEffect(() => {
    // Waits for `mounted`: the portal renders nothing on the first pass, so
    // there is no panel to focus until the second.
    if (!mounted) return
    const opener = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => opener?.focus?.()
  }, [mounted])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { requestClose(); return }
      if (e.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) { e.preventDefault(); panel.focus(); return }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [requestClose])

  if (!mounted) return null

  const animation = reduced
    ? undefined
    : closing
      ? `sheet-out ${EXIT_MS}ms ease-in both`
      : `sheet-in 320ms ${EASE} both`

  return createPortal(
    <div
      className={`fixed inset-0 flex items-end justify-center ${layer === 'over' ? 'z-[60]' : 'z-50'}`}
      onClick={(e) => { if (e.target === e.currentTarget) requestClose() }}
      style={{
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        animation: reduced ? undefined : `${closing ? 'fade-out' : 'fade-in'} ${closing ? EXIT_MS : 220}ms ease both`,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`w-full max-w-lg rounded-t-3xl overflow-hidden flex flex-col outline-none ${className ?? ''}`}
        style={{
          background: 'var(--color-surface)',
          borderTop: `1px solid ${GLASS.hairline}`,
          maxHeight: '92dvh',
          animation,
        }}
      >
        {/* Grab handle. Decorative — the sheet is not draggable, it just reads as
            dismissible, which is what stops people hunting for the close button. */}
        <div className="flex justify-center pt-3 pb-1 shrink-0" aria-hidden>
          <div className="w-10 h-1 rounded-full" style={{ background: GLASS.hairlineStrong }} />
        </div>
        <SheetCloseContext.Provider value={requestClose}>{children}</SheetCloseContext.Provider>
      </div>
    </div>,
    document.body,
  )
}

/** The sticky title block: eyebrow, heading, close. */
export function SheetHeader({
  eyebrow,
  title,
  eyebrowColor = ACCENT,
  children,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  eyebrowColor?: string
  /** Anything extra under the heading — a subtitle, a step rail. */
  children?: ReactNode
}) {
  const close = useContext(SheetCloseContext)

  return (
    <div
      className="px-5 pt-2 pb-4 shrink-0"
      style={{ borderBottom: `1px solid ${GLASS.hairline}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <Eyebrow color={eyebrowColor} className="mb-0.5">{eyebrow}</Eyebrow>}
          <h2 className="text-lg font-black text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
            {title}
          </h2>
        </div>
        {close && <IconButton icon="x" label="Close" size="sm" filled onClick={close} className="-mr-1 -mt-1" />}
      </div>
      {children}
    </div>
  )
}

/** The scrolling middle. */
export function SheetBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`overflow-y-auto flex-1 px-5 py-4 ${className ?? ''}`}>{children}</div>
}

/** A pinned action row that never scrolls out of reach. */
export function SheetFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`px-5 py-4 flex gap-2 shrink-0 ${className ?? ''}`}
      style={{ borderTop: `1px solid ${GLASS.hairline}` }}
    >
      {children}
    </div>
  )
}
