'use client'

import { buttonSurface } from '@/components/system'
import { GUIDE_COPY } from '@/lib/guide/copy'

/** The guide page's two actions: the calendar file, and the image to keep. */
export function GuideActions({ token }: { token: string }) {
  const reminders = buttonSurface('primary', 'lg')
  const image = buttonSurface('secondary', 'md')
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)' }}>
      <a href={`/api/guide/${token}/calendar`} className={reminders.className} style={reminders.style} data-guide-calendar>
        {GUIDE_COPY.reminders}
      </a>
      <a href={`/api/guide/${token}/image`} download="chrgd-stack-guide.png" className={image.className} style={image.style}>
        {GUIDE_COPY.saveImage}
      </a>
    </div>
  )
}
