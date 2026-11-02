/**
 * The words on the read's story (Amp Consult and offer plan, Phase 8): its
 * card titles and the lines that move people through it. Scripted, one file,
 * in the review pack; never AI-written. The read itself (patterns, evidence,
 * habit fixes, claims) is Phase 5's approved content, drawn as it is.
 *
 * No pressure: nothing about time running out or what they'll miss. The free
 * gift is said in the offer's own approved words, its conditions beside it
 * (`OFFER_COPY`).
 */

export const STORY_COPY = {
  label: 'Your read',
  /** Card kickers, by card. */
  day: 'Your day',
  spotted: 'What I spotted',
  dots: 'Joining the dots',
  tryThis: 'Try this week',
  startHere: 'Start here',
  share: 'Share',
  profile: 'Your profile',
  /** The cards' headings. */
  dayHeading: 'This is your day, as you told it',
  dotsHeading: 'How I got there',
  ruledOut: 'Ruled out',
  tryHeading: 'Small changes, worth a go',
  tryHint: 'Tap one to see it on your day.',
  startHeading: 'Your stack, hero first',
  shareHeading: 'Your read, to share',
  shareLine: 'A card with your result and your stack. Nothing about your answers.',
  shareButton: 'Share my read',
  /** Moving through it. */
  next: 'Next',
  back: 'Back',
  skip: 'Skip to my stack',
  skipHint: 'Swipe down to skip to your stack',
  seeMyStack: 'See my stack',
  beforeYouStart: 'Before you start',
} as const

/**
 * The words on a shared story card (plan Phase 8): its eyebrow, its titles and
 * where to find the consult. Nothing about the person: a shared card carries
 * no health information (`share-card/story.ts`).
 */
export const STORY_CARD_COPY = {
  eyebrow: 'Amp Consult · my read',
  day: 'My day',
  spotted: 'Amp spotted',
  dots: 'How Amp got there',
  start: 'Where I’m starting',
  hero: 'Not the obvious pick',
  narrowing: 'Narrowing it down',
  footer: 'Find yours: the Amp Consult at getchrgd.co.uk',
  shareThis: 'Share this card',
  saving: 'Making your card…',
  holdToSave: 'Press and hold the card to save it, then add it to your story.',
  close: 'Close',
} as const
