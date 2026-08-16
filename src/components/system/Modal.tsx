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
import { Icon } from '@/components/ui/Icon'

/**
 * A modal panel.
 *
 * The Founders Hub hand-rolls four of these — `ProductEditor`, `AiSuggestPanel`,
 * `BundleEditor`, `PartnerDetail` — with scrims of `rgba(0,0,0,0.72)` in three
 * and `rgba(0,0,0,0.6)` in the fourth. None of them animates, none traps focus,
 * and none gives focus back on close, so a keyboard user can Tab straight out of
 * an open dialog into the page behind it and then has no way to tell they have.
 *
 * Mounting is opening: parents already render `{editing && <Editor …/>}`, so
 * adopting this needs no state changes.
 *
 * ── This is one of the three surfaces allowed to blur ───────────────────────
 * A modal is persistent chrome over a static page — exactly the case
 * `backdrop-filter` is worth paying for, and the moment the layered ground
 * actually does something. The scrim blurs lightly and the panel blurs more, so
 * the page reads as receding behind two sheets of glass rather than being hidden
 * by one grey rectangle.
 *
 * ── Closing ─────────────────────────────────────────────────────────────────
 * Every dismissal the user initiates — backdrop, Escape, the close button — runs
 * the exit animation and calls `onClose` when it finishes. A parent that
 * unmounts the modal for its own reasons still gets an instant close, which is
 * the right trade: the alternative is a panel that lingers after the thing it
 * was editing is gone.
 */

const EXIT_MS = 160

/** Lets `ModalHeader` close through the exit animation without prop-threading. */
const ModalCloseContext = createContext<(() => void) | null>(null)

type Size = 'sm' | 'md' | 'lg'

const WIDTH: Record<Size, string> = {
  sm: 'var(--modal-sm)',
  md: 'var(--modal-md)',
  lg: 'var(--modal-lg)',
}

export interface ModalProps {
  children: ReactNode
  onClose: () => void
  size?: Size
  /** Accessible name, when the modal has no `ModalHeader` to label it. */
  label?: string
  className?: string
}

export function Modal({ children, onClose, size = 'md', label, className }: ModalProps) {
  const [mounted, setMounted] = useState(false)
  const [closing, setClosing] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    setMounted(true)
  }, [])

  const requestClose = useCallback(() => {
    if (closeTimer.current) return
    if (reduced) {
      onClose()
      return
    }
    setClosing(true)
    closeTimer.current = setTimeout(onClose, EXIT_MS)
  }, [onClose, reduced])

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    },
    [],
  )

  // Restores the previous value rather than clearing it, so a modal opened over
  // an open sheet does not unlock the page when the upper one closes.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  // Focus in on open, back to the opener on close. Without the second half,
  // dismissing a dialog drops a keyboard user at the top of the document.
  useEffect(() => {
    if (!mounted) return
    const opener = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => opener?.focus?.()
  }, [mounted])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        requestClose()
        return
      }
      if (e.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }

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

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose()
      }}
      style={{
        background: 'var(--surface-scrim)',
        // The saturate is what stops blurred glass going grey — it pulls the
        // colour back up out of the blur so the ground's cyan still reads
        // through the panel instead of washing out to a neutral haze.
        backdropFilter: 'blur(var(--blur-scrim)) saturate(var(--blur-saturate))',
        WebkitBackdropFilter: 'blur(var(--blur-scrim)) saturate(var(--blur-saturate))',
        padding: 'var(--space-4)',
        animation: reduced
          ? undefined
          : `${closing ? 'system-scrim-out' : 'system-scrim-in'} ${closing ? EXIT_MS : 200}ms var(--ease-settle) both`,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`system-glass w-full flex flex-col overflow-hidden outline-none ${className ?? ''}`}
        style={{
          maxWidth: WIDTH[size],
          maxHeight: '86dvh',
          background: 'var(--surface-3)',
          backdropFilter: 'blur(var(--blur-panel)) saturate(var(--blur-saturate))',
          WebkitBackdropFilter: 'blur(var(--blur-panel)) saturate(var(--blur-saturate))',
          border: '1px solid var(--edge)',
          borderTopColor: 'var(--edge-top)',
          borderRadius: 'var(--radius-sheet)',
          boxShadow: 'var(--shadow-panel)',
          animation: reduced
            ? undefined
            : closing
              ? `system-panel-out ${EXIT_MS}ms var(--ease-exit) both`
              : `system-panel-in var(--duration-slow) var(--ease-spring) both`,
        }}
      >
        <ModalCloseContext.Provider value={requestClose}>{children}</ModalCloseContext.Provider>
      </div>
    </div>,
    document.body,
  )
}

/** The title block. Does not scroll. */
export function ModalHeader({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  const close = useContext(ModalCloseContext)

  return (
    <div
      className="flex items-start justify-between shrink-0"
      style={{
        gap: 'var(--space-3)',
        padding: 'var(--space-4) var(--space-5)',
        borderBottom: '1px solid var(--edge)',
      }}
    >
      <div className="min-w-0">
        <h2
          style={{
            fontSize: 'var(--text-title)',
            fontWeight: 'var(--weight-display)',
            fontFamily: 'var(--font-display)',
            letterSpacing: 'var(--tracking-title)',
            lineHeight: 'var(--leading-tight)',
            color: 'var(--ink-1)',
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            style={{
              fontSize: 'var(--text-meta)',
              lineHeight: 'var(--leading-snug)',
              color: 'var(--ink-3)',
              marginTop: 'var(--space-1)',
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {close && (
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="system-control system-focus shrink-0 inline-flex items-center justify-center"
          style={{
            width: 'var(--control-sm)',
            height: 'var(--control-sm)',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--fill-glass)',
            border: '1px solid var(--edge)',
            borderTopColor: 'var(--edge-top)',
            color: 'var(--ink-2)',
            ['--rest-shadow' as string]: 'var(--inset-hairline)',
            ['--hover-bg' as string]: 'var(--surface-hover)',
            ['--hover-edge' as string]: 'var(--edge-strong)',
            ['--hover-shadow' as string]: 'var(--inset-hairline)',
          }}
        >
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  )
}

/** The scrolling middle. */
export function ModalBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`overflow-y-auto flex-1 ${className ?? ''}`}
      style={{ padding: 'var(--space-5)' }}
    >
      {children}
    </div>
  )
}

/**
 * A pinned action row that never scrolls out of reach.
 *
 * Actions sit right, in the platform order — the dismissal first, the thing you
 * came to do last and nearest the thumb.
 */
export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-end ${className ?? ''}`}
      style={{
        gap: 'var(--space-2)',
        padding: 'var(--space-4) var(--space-5)',
        borderTop: '1px solid var(--edge)',
      }}
    >
      {children}
    </div>
  )
}
