'use client'

import { buttonSurface } from '@/components/system'
import { GUIDE_COPY } from '@/lib/guide/copy'
import { TRAINING_COPY } from '@/lib/training/copy'

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

/** Into the training plan in their hub, when it's switched on. */
export function GuideTrainingLink() {
  const link = buttonSurface('secondary', 'md')
  return (
    <a href="/myhub/training" className={link.className} style={link.style} data-guide-training>
      {TRAINING_COPY.guideLink}
    </a>
  )
}
