'use client'

import { useEffect, useState } from 'react'
import { analyticsOptedOutHere, privacyOptedOut, setAnalyticsOptOut } from '@/lib/analytics/events'

const ACCENT = '#00D4FF'

/**
 * The off switch for the funnel analytics, on the page that explains them.
 *
 * ── Why this is not a floating banner ───────────────────────────────────────
 * It was one, briefly, and the visual pass caught what the idea was worth: every
 * commercial surface in this app anchors its primary action to the bottom of the
 * viewport — the shop's basket bar, the bundle page's buy bar, the quiz's
 * Continue — so a fixed strip at the bottom covers the button each page exists
 * to have pressed. A consent control that breaks the buy button is not a
 * compliance win; it is a worse product and a worse outcome for the people it
 * is meant to protect.
 *
 * So the disclosure lives in the privacy notice, which is linked from the
 * places someone actually passes through — the consent gate on the safety
 * screen, the analysis screen, the checkout, My Hub and every email footer —
 * and the switch lives here beside it, where the explanation is.
 *
 * That is a defensible reading of PECR for this particular processing rather
 * than a shortcut: no cookie, no third-party script, no cross-session
 * identifier, nothing personal in the payload, the id dropped when the tab
 * closes, and Do Not Track and Global Privacy Control honoured without being
 * asked. The residual risk is recorded in the DPIA rather than waved away.
 */
export function AnalyticsOptOut() {
  const [off, setOff] = useState(false)
  const [bySignal, setBySignal] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setOff(analyticsOptedOutHere())
    // A browser signal is a standing instruction we honour whatever this
    // control says, so the switch would be lying if it offered to turn
    // something back on that the browser has already refused.
    setBySignal(privacyOptedOut() && !analyticsOptedOutHere())
    setReady(true)
  }, [])

  // Rendered only once the browser has been asked, so the control never flashes
  // the wrong state on load.
  if (!ready) return null

  if (bySignal) {
    return (
      <p className="text-[13px] leading-relaxed" style={{ opacity: 0.75 }}>
        Your browser sends a Do Not Track or Global Privacy Control signal, so we are not
        recording anything. Nothing for you to do here.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-relaxed" style={{ opacity: 0.85 }}>
        {off
          ? 'You have turned this off on this device. We are not recording your visits.'
          : 'We keep one random number in your browser so we can see where people get stuck. It has nothing personal in it and it goes when you close the tab.'}
      </p>
      <div>
        <button
          type="button"
          onClick={() => {
            const next = !off
            setAnalyticsOptOut(next)
            setOff(next)
          }}
          className="rounded-xl px-4 py-2.5 text-[13px] font-semibold"
          style={
            off
              ? { border: '1px solid currentColor', color: 'inherit', opacity: 0.85 }
              : { background: ACCENT, color: '#04121a' }
          }
        >
          {off ? 'Turn it back on' : 'Turn this off'}
        </button>
      </div>
      <p className="text-[12px] leading-relaxed" style={{ opacity: 0.55 }}>
        This choice is kept on this device only, and takes effect straight away.
      </p>
    </div>
  )
}
