'use client'

import { useEffect, useState } from 'react'
import { browserSaysNo, getAdConsent, setAdConsent, type AdConsent } from '@/lib/analytics/meta-pixel'

const ACCENT = '#00D4FF'

/**
 * Changing your answer to the advertising-cookie prompt, on the page that
 * explains it. Same look as `AnalyticsOptOut` beside it.
 */
export function AdConsentControl() {
  const [consent, setConsent] = useState<AdConsent | null>(null)
  const [bySignal, setBySignal] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setConsent(getAdConsent())
    setBySignal(browserSaysNo())
    setReady(true)
  }, [])

  if (!ready) return null

  if (bySignal) {
    return (
      <p className="text-[13px] leading-relaxed" style={{ opacity: 0.75 }}>
        Your browser sends a Do Not Track or Global Privacy Control signal, or you have turned usage
        analytics off, so advertising cookies are off too. Nothing for you to do here.
      </p>
    )
  }

  const on = consent === 'granted'
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-relaxed" style={{ opacity: 0.85 }}>
        {on
          ? 'You said yes. Meta receives the page visits and purchases described above.'
          : 'Off. Nothing is sent to Meta from this device.'}
      </p>
      <div>
        <button
          type="button"
          onClick={() => {
            const next: AdConsent = on ? 'denied' : 'granted'
            setAdConsent(next)
            setConsent(next)
          }}
          className="rounded-xl px-4 py-2.5 text-[13px] font-semibold"
          style={
            on
              ? { background: ACCENT, color: '#04121a' }
              : { border: '1px solid currentColor', color: 'inherit', opacity: 0.85 }
          }
        >
          {on ? 'Turn advertising cookies off' : 'Allow advertising cookies'}
        </button>
      </div>
    </div>
  )
}
