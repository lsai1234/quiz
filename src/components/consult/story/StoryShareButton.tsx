'use client'

import { useState } from 'react'
import { encodeStoryShare, STORY_SHARE_TEXT, type StoryShare } from '@/lib/share-card/story'
import { shareCard } from '@/lib/share-card/share-action'
import { STORY_CARD_COPY } from '@/lib/consult/story-copy'
import { consultFunnel } from '@/lib/analytics/consult'
import { QuietLink } from '../controls'

/**
 * "Share this card" on a story card (plan Phase 8): the card as a 1080×1920
 * image (`/api/share/story/image`), handed to the phone's share sheet where
 * the browser can share files, else downloaded, else shown full size to press
 * and hold, the stack card's own ladder (`shareCard`).
 *
 * The link with it is the consult's front door, nothing more: a card's own
 * link (challenge links) is a later item, with its storage proposed first.
 */
export function StoryShareButton({ share }: { share: StoryShare }) {
  const [state, setState] = useState<'idle' | 'saving' | 'hold'>('idle')
  const [image, setImage] = useState<string | null>(null)

  async function go() {
    setState('saving')
    const src = `/api/share/story/image?d=${encodeStoryShare(share)}`
    try {
      const res = await fetch(src)
      if (!res.ok) throw new Error(String(res.status))
      const blob = await res.blob()
      const outcome = await shareCard({ blob, fileName: `chrgd-my-read-${share.card}.png`, text: STORY_SHARE_TEXT, url: `${window.location.origin}/`, format: 'story' })
      if (outcome.ok && outcome.method) consultFunnel.storyShare({ card: share.card, method: outcome.method })
      if (!outcome.ok && !outcome.cancelled) {
        // The last rung: the image, full size, to press and hold.
        setImage(URL.createObjectURL(blob))
        setState('hold')
        consultFunnel.storyShare({ card: share.card, method: 'long-press' })
        return
      }
    } catch {
      consultFunnel.storyShare({ card: share.card, method: 'failed' })
    }
    setState('idle')
  }

  return (
    <>
      <QuietLink onClick={() => void go()} disabled={state === 'saving'} data-story-share={share.card}>
        {state === 'saving' ? STORY_CARD_COPY.saving : STORY_CARD_COPY.shareThis}
      </QuietLink>
      {state === 'hold' && image && (
        <div role="dialog" aria-modal="true" aria-label={STORY_CARD_COPY.shareThis} className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ gap: 'var(--amp-space-3)', padding: 'var(--amp-space-5) var(--amp-gutter)', background: 'var(--amp-scrim)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL, to press and hold */}
          <img src={image} alt="" style={{ maxHeight: '75vh', width: 'auto', borderRadius: 'var(--amp-radius-tile)' }} />
          <p className="text-center" style={{ color: 'var(--amp-ink)', fontSize: 'var(--amp-text-meta)' }}>
            {STORY_CARD_COPY.holdToSave}
          </p>
          <QuietLink
            icon="close"
            onClick={() => {
              URL.revokeObjectURL(image)
              setImage(null)
              setState('idle')
            }}
          >
            {STORY_CARD_COPY.close}
          </QuietLink>
        </div>
      )}
    </>
  )
}
