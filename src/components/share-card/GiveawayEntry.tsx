'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { closesLabel } from '@/lib/competition/prize'
import { cardImageUrl } from '@/lib/share-card/share-link'
import type { ShareCardPayload } from '@/lib/share-card/types'
import {
  COMPETITION_EVENT, enterByEmail, hasPendingShare, rememberedEntry, type RememberedEntry,
} from '@/lib/competition/client'
import { GiveawayEntryView } from './GiveawayEntryView'

/**
 * Entering the giveaway, at the foot of the results page.
 *
 * ── The mechanic ────────────────────────────────────────────────────────────
 * Finish the quiz, leave an email: one entry. Share the card to your story on
 * top: ten more. The quiz is the qualifier, so this lives only where the quiz
 * ends — and the email is the entry, so nobody has to tag anything or come back
 * to type a handle.
 *
 * ── Why it starts as one button ─────────────────────────────────────────────
 * This page's job is checkout. A form sitting open under the plan is a second
 * call to action competing with the first; a button that opens one asks for
 * nothing until somebody has chosen to enter.
 *
 * Renders nothing unless a competition is open — the state is read live, same
 * rule as the card (`docs/SHARE_CARD_BLUEPRINT.md` §3.7).
 *
 * ── Logic here, looks in the view ───────────────────────────────────────────
 * This owns fetching, storage and submission; `GiveawayEntryView` draws any
 * state from plain props. That is what lets `/styleguide/giveaway` show every
 * state side by side without a network or a finished quiz.
 */

interface Live {
  state: string
  name: string
  prize: string
  test: boolean
  closesAt: string | null
  shareBonus?: number
}

export function GiveawayEntry({ onShare, payload }: {
  /** Opens the share sheet. Sharing from there is what earns the bonus. */
  onShare: () => void
  /** The stack, for the thumbnail of the card they would share. */
  payload?: ShareCardPayload
}) {
  const [comp, setComp] = useState<Live | null>(null)
  const [entry, setEntry] = useState<RememberedEntry | null>(null)
  const [pendingShare, setPendingShare] = useState(false)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'invalid' | 'closed' | 'error'>('idle')

  useEffect(() => {
    let live = true
    fetch('/api/competition/enter')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Live | null) => { if (live && d?.state === 'open') setComp(d) })
      .catch(() => {})
    return () => { live = false }
  }, [])

  // The share sheet credits the bonus out of sight of this component, so it
  // listens rather than being told.
  useEffect(() => {
    if (!comp) return
    const sync = () => {
      setEntry(rememberedEntry(comp.name))
      setPendingShare(hasPendingShare(comp.name))
    }
    sync()
    window.addEventListener(COMPETITION_EVENT, sync)
    return () => window.removeEventListener(COMPETITION_EVENT, sync)
  }, [comp])

  // The same URL the share sheet requests, so the thumbnail warms its cache.
  const thumb = useMemo(() => (payload ? cardImageUrl(payload, 'entry') : null), [payload])

  if (!comp) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!comp || status === 'sending') return
    setStatus('sending')
    const result = await enterByEmail({ campaign: comp.name, email })
    if (result.ok) {
      setEntry(result.entry)
      setStatus('idle')
      return
    }
    setStatus(result.reason === 'invalid-email' ? 'invalid' : result.reason)
  }

  return (
    <GiveawayEntryView
      prize={comp.prize}
      test={comp.test}
      closes={closesLabel(comp.closesAt)}
      bonus={comp.shareBonus ?? 10}
      cardImageUrl={thumb}
      phase={entry ? 'entered' : open ? 'form' : 'invite'}
      email={email}
      status={status}
      pendingShare={pendingShare}
      entry={entry ? { email: entry.email, tickets: entry.tickets, shared: entry.shared } : null}
      onOpen={() => setOpen(true)}
      onEmailChange={(value) => {
        setEmail(value)
        if (status === 'invalid') setStatus('idle')
      }}
      onSubmit={submit}
      onShare={onShare}
    />
  )
}
