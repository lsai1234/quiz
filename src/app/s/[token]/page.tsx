import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getShareCard, recordShareCardView } from '@/lib/db/share-cards'
import { buildShareCardView } from '@/lib/share-card/format'

/**
 * Where a shared link lands.
 *
 * Two jobs, and the second is the one that pays for the feature:
 *
 *   1. **Unfurl properly.** A link pasted into WhatsApp, iMessage, Slack,
 *      Discord or X shows the card itself, because the `og:image` below is the
 *      same renderer the customer downloaded from.
 *   2. **Convert.** Somebody arrives here because a friend posted a stack. One
 *      thing to do next, above the fold, in their words: build your own.
 *
 * The page is deliberately thin. It is not a second results screen — there is no
 * price, no basket, no product detail. Anything more is a page somebody reads
 * instead of taking the quiz.
 */

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ token: string }>
}

/**
 * The unfurl.
 *
 * `og:image` points at the stored-card image route rather than at a static file,
 * so the preview is the card and cannot drift from it. 1200×630 is what every
 * scraper expects; the story and square sizes are for saving, not for previews.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const card = await getShareCard(token)

  if (!card) {
    return { title: 'CHRGD', description: 'Build your personalised supplement stack in 90 seconds.' }
  }

  const { stackName, archetype } = card.payload
  const title = `${stackName} — a CHRGD stack`
  const description = archetype
    ? `${archetype}. Built from a 90-second quiz — build yours.`
    : 'Built from a 90-second quiz — build yours.'
  const image = `/api/share/${card.token}/image?format=og`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: `${stackName} — a CHRGD stack` }],
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
    // A shared card is somebody's own page, not a landing page we want ranking.
    robots: { index: false, follow: true },
  }
}

export default async function SharedCardPage({ params }: Props) {
  const { token } = await params
  const card = await getShareCard(token)
  if (!card) notFound()

  // Counted here and not in the image route: every unfurl bot that touches a
  // pasted link fetches the image, and counting those would make a card nobody
  // opened look like a card that travelled.
  await recordShareCardView(card.token).catch(() => {})

  const view = buildShareCardView(card.payload, 'story')
  const cta = card.payload.code ? `/?ref=${encodeURIComponent(card.payload.code)}` : '/'

  return (
    <main
      className="min-h-screen flex flex-col items-center px-5 py-8"
      style={{ background: 'var(--color-bg)' }}
    >
      <div className="w-full max-w-sm flex flex-col items-center">
        <p
          className="text-[10px] font-bold tracking-[0.25em] uppercase mb-5"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-accent)' }}
        >
          {view.eyebrow}
        </p>

        {/*
          The card, large — it is the whole reason anybody followed the link —
          but capped at 62% of the viewport.

          At its natural 9:16 a 1080×1920 card is taller than a phone screen, so
          the page opened on a picture with the call to action somewhere below
          the fold: the one thing this page exists to do was the one thing a
          visitor had to scroll to find. Capping the height keeps the card the
          hero and puts the button in the same view.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/share/${card.token}/image?format=story`}
          alt={`${card.payload.stackName} — a CHRGD stack`}
          width={1080}
          height={1920}
          className="w-auto rounded-3xl"
          style={{
            border: '1px solid var(--color-border)',
            maxHeight: '62dvh',
            maxWidth: '100%',
            boxShadow: '0 30px 70px -40px rgba(0,0,0,0.95)',
          }}
        />

        <h1
          className="text-2xl font-black tracking-tight mt-7 text-center"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
        >
          Build your own in 90 seconds
        </h1>
        <p className="text-sm mt-2 text-center leading-relaxed" style={{ color: 'var(--color-text-2)' }}>
          Answer a few questions and we’ll build a stack around your goals, your
          training and what you already take.
        </p>

        <Link
          href={cta}
          className="w-full mt-5 py-4 rounded-2xl text-base font-black tracking-tight text-center"
          style={{ fontFamily: 'var(--font-display)', background: 'var(--color-accent)', color: '#07070A' }}
        >
          Start the quiz
        </Link>

        {card.payload.code && (
          <p className="text-xs mt-4 text-center" style={{ color: 'var(--color-muted)' }}>
            Code{' '}
            <strong style={{ color: 'var(--color-text)' }}>{card.payload.code}</strong>{' '}
            is applied at checkout.
          </p>
        )}
      </div>
    </main>
  )
}
